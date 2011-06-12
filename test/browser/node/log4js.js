// log4js stub
//

define([], function() {
  function noop() {};

  var VERBOSE = true;

  var noops = { "trace": VERBOSE ? console.trace : noop
              , "debug": VERBOSE ? console.log   : noop
              , "info" : VERBOSE ? console.info  : noop
              , "warn" : VERBOSE ? console.warn  : noop
              , "error": VERBOSE ? console.error : noop
              , "fatal": VERBOSE ? console.error : noop

              , "setLevel": noop
              }

  return { 'getLogger': function() { return noops }
         }
})
