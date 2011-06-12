
define(['events', 'querystring', 'test/run'], function(events, querystring, test_runner) {
  $('#boot').html('<p>Starting</p><p id="con"></p>');
  // Set up some faux Node stuff.
  var process = window.process = new events.EventEmitter;

  process.env = querystring.parse(window.location.search.slice(1));

  process.stdout = {};
  process.stdout.write = function(x) {
    var con = $('#con');
    var html = con.html();
    con.html(html + x);
  }

  process.exit = function(code) {
    var log = (code === 0) ? console.log : console.error;
    log("Exit " + code);
  }

  return function() { // main()
    console.log('Main running');

    try       { test_runner.run() }
    catch(er) { console.log("Error starting tests"); console.log(er) }
  }
})
