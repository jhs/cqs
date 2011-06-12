window.process = { env: {} };

define(['events', 'querystring', 'test/run'], function(events, querystring, test_runner) {
  $('#boot').html('Starting');
  // Set up some faux Node stuff.
  var process = window.process = new events.EventEmitter;

  process.env = querystring.parse(window.location.search.slice(1));

  process.stdout = {};
  process.stdout.write = function(x) {
    var con = $('#results');
    var html = con.html();
    con.html(html + x);
  }

  process.exit = function(code) {
    if(code === 0)
      console.log("'EXIT' " + code);
    else
      console.error("'EXIT' " + code);
  }


  return function() { // main()
    console.log('Main running');

    try       { test_runner.run() }
    catch(er) { console.log("Error starting tests"); console.log(er) }
  }
})
