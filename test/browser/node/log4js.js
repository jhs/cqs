// log4js stub
//

define([], function() {
  function noop() {};

  var VERBOSE = true;

  var noops = { "trace": VERBOSE ? function(X) { return console.trace(X) } : noop
              , "debug": VERBOSE ? function(X) { return console.log  (X) } : noop
              , "info" : VERBOSE ? function(X) { return console.info (X) } : noop
              , "warn" : VERBOSE ? function(X) { return console.warn (X) } : noop
              , "error": VERBOSE ? function(X) { return console.error(X) } : noop
              , "fatal": VERBOSE ? function(X) { return console.error(X) } : noop

              , "setLevel": noop
              }

  return function() {
    return { 'getLogger': function() { return noops }
           }
  }
})
