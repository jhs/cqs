// The Couch Queue Service API
//

var lib = require('./lib')
  , util = require('util')
  , couch = require('./couch')
  , queue = require('./queue')
  , message = require('./message')
  ;

var API = { 'Db': couch.Database

          , 'Queue'      : queue.Queue
          , 'CreateQueue': queue.CreateQueue

          , 'Message': message.Message
          }


function with_defaults(opts) {
  var new_api = {};
  Object.keys(API).forEach(function(name) {
    var api_val = API[name];
    new_api[name] = api_val;
    if(typeof api_val !== 'function')
      return;

    function default_wrapper(given_opts) {
      given_opts = lib.opt_str(given_opts);
      lib.copy(opts, given_opts);
      arguments[0] = given_opts;

      return api_val.apply(this, arguments);
    }

    new_api[name] = default_wrapper;
  })

  return new_api;
}

module.exports = with_defaults({});
module.exports.defaults = with_defaults;
