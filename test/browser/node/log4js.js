// log4js stub
//

define([], function() {
  function noop() {};

  var VERBOSE = true;

  var noops = { "trace": VERBOSE ? function(a,b,c) { return console.trace(a,b,c) } : noop
              , "debug": VERBOSE ? function(a,b,c) { return console.log  (a,b,c) } : noop
              , "info" : VERBOSE ? function(a,b,c) { return console.info (a,b,c) } : noop
              , "warn" : VERBOSE ? function(a,b,c) { return console.warn (a,b,c) } : noop
              , "error": VERBOSE ? function(a,b,c) { return console.error(a,b,c) } : noop
              , "fatal": VERBOSE ? function(a,b,c) { return console.error(a,b,c) } : noop

              , "setLevel": noop
              }

  return function() {
    return { 'getLogger': function() { return noops }
           }
  }
})
