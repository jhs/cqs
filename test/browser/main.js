
define(['events', 'test/run'], function(events, test_runner) {
  // Set up some faux Node stuff.
  window.process = new events.EventEmitter;
  //window.process.removeAllListeners

  return function() { // main()
    console.log('Main running');

    try       { test_runner.run() }
    catch(er) { console.error("Error starting tests");
                console.error(er) }
  }
})
