/* Copyright (c) 2012: Daniel Richman. License: GNU GPL 3 */
/* Additional features: Priyesh Patel                     */


function paramsNoDirection() {
    var vars = {};
    console.log("3 logs");
    console.log(window.location.href);
    var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
        vars[key] = value;
    });
    console.log("log " + String(vars["log"]));
    console.log("dir " + String(vars["dir"]));
    setTimeout(function(){debugger;}, 3000);
    return vars["log"];
}

function log_backward() {
    
    var log = paramsNoDirection();
    if (log == undefined) {
        return "./";
    } else {
        return "./?log=" + log;
    }
}

function log_forward(parts) {
    var log = paramsNoDirection();
    if (log == undefined) {
        return "./?dir=fwd";
    } else {
        return "./?log=" + log + "&dir=fwd";
    }
}


(function () {

var dataelem = "#data";
var pausetoggle = "#pause";
var scrollelems = ["html", "body"];

var url = "log";
var fix_rn = true;
var load = 30 * 1024; /* 30KB */
var poll = 1000; /* 1s */

var kill = false;
var loading = false;
var pause = false;
var reverse = true;
var log_data = "";
var log_file_size = 0;

/* :-( https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/parseInt */
function parseInt2(value) {
    if(!(/^[0-9]+$/.test(value))) throw "Invalid integer " + value;
    var v = Number(value);
    if (isNaN(v))                 throw "Invalid integer " + value;
    return v;
}

function get_log(opt) {
    if (kill | loading) return;
    loading = true;

    var range;
    var first_load;
    var must_get_206;
    if (log_file_size === 0) {
        /* Get the last 'load' bytes */
        range = "-" + load.toString();
        first_load = true;
        must_get_206 = false;
        console.log("Log file size = 0");
    } else {
        /* Get the (log_file_size - 1)th byte, onwards. */
        console.log("Log file size != 0");
        range = (log_file_size - 1).toString() + "-";
        first_load = false;
        must_get_206 = log_file_size > 1;
        
    }

    /* The "log_file_size - 1" deliberately reloads the last byte, which we already
     * have. This is to prevent a 416 "Range unsatisfiable" error: a response
     * of length 1 tells us that the file hasn't changed yet. A 416 shows that
     * the file has been trucnated */
     
    if (undefined !== opt && opt.length) {
        url = opt;
    }

    $.ajax(url, {
        dataType: "text",
        cache: false,
        headers: {Range: "bytes=" + range},
        success: function (data, s, xhr) {
            loading = false;

            var content_size;
            console.log("In Ajax");
            if (xhr.status === 206) {
                console.log("Status 206 - OK");
                var c_r = xhr.getResponseHeader("Content-Range");
                if (!c_r)
                    throw "Server did not respond with a Content-Range";
                console.log("Started Split");
                log_file_size = parseInt2(c_r.split("/")[1]);
                console.log("Finished Split");
                console.log("Started getResponseHeader");
                content_size = parseInt2(xhr.getResponseHeader("Content-Length"));
                console.log("Finished getResponseHeader");
            } else if (xhr.status === 200) {
                console.log("Status 200");
                if (must_get_206)
                    throw "Expected 206 Partial Content";

                content_size = log_file_size =
                        parseInt2(xhr.getResponseHeader("Content-Length"));
            } else {
                console.log("Unexpected error");
                throw "Unexpected status " + xhr.status;
            }

            if (first_load && data.length > load)
                throw "Server's response was too long";

            var added = false;

            if (first_load) {
                /* Clip leading part-line if not the whole file */
                if (content_size < log_file_size) {
                    var start = data.indexOf("\n");
                    log_data = data.substring(start + 1);
                } else {
                    log_data = data;
                }
                console.log("First load - Done");
                added = true;
            } else {
                console.log("Subsequent Load - Started");
                /* Drop the first byte (see above) */
                log_data += data.substring(1);

                if (log_data.length > load) {
                    var start = log_data.indexOf("\n", log_data.length - load);
                    log_data = log_data.substring(start + 1);
                }

                if (data.length > 1)
                    added = true;
                console.log("Subsequent Load - Done");
            }

            if (added) {
                console.log("show_log - Before");
                show_log(added);
                console.log("show_log - After");
            }
            setTimeout(get_log, poll);
        },
        error: function (xhr, s, t) {
            loading = false;
            console.log("** ERROR **");
            if (xhr.status === 416 || xhr.status == 404) {
                /* 416: Requested range not satisfiable: log was truncated. */
                /* 404: Retry soon, I guess */

                log_file_size = 0;
                log_data = "";
                show_log();

                setTimeout(get_log, poll);
            } else {
                throw "Unknown AJAX Error (status " + xhr.status + ")";
            }
        }
    });
}

function scroll(where) {
    for (var i = 0; i < scrollelems.length; i++) {
        var s = $(scrollelems[i]);
        if (where === -1)
            s.scrollTop(s.height());
        else
            s.scrollTop(where);
    }
}

function show_log() {
    if (pause) return;

    var t = log_data;

    if (reverse) {
        var t_a = t.split(/\n/g);
        t_a.reverse();
        if (t_a[0] == "") 
            t_a.shift();
        t = t_a.join("\n");
    }

    if (fix_rn)
        t = t.replace(/\n/g, "\r\n");

    $(dataelem).text(t);
    if (!reverse)
        scroll(-1);
}

function error(what) {
    kill = true;

    $(dataelem).text("An error occured :-(.\r\n" +
                     "Reloading may help; no promises.\r\n" + 
                     what);
    scroll(0);

    return false;
}

$(document).ready(function () {
    window.onerror = error;

    /* If URL is /logtail/?noreverse display in chronological order */
    var uhash = location.search.replace(/^\?/, "");
    reverse = true;
    var url = '';

    var result = uhash.split('&').reduce(function (result, item) {
        var parts = item.split('=');
        result[parts[0]] = parts[1];
        /* lil cleanup incase a leading or trailing & is found */
        delete result[""]; 
        return result;
    }, {});

    /* concole debug */
    console.log("This URL");
    console.log(result);
    
    if ("log" in result) {
        url = result["log"];
    }
    
    if ("dir" in result && result["dir"] == "fwd") {
        reverse = false
    }    

    /* Add pause toggle */
    $(pausetoggle).click(function (e) {
        pause = !pause;
        $(pausetoggle).text(pause ? "Unpause" : "Pause");
        show_log();
        e.preventDefault();
    });
    console.log(url);
    get_log(url);
});

})();
