// The Couch Queue Service API
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var lib = require('./lib')
  , util = require('util')
  , couch = require('./couch')
  , queue = require('./queue')
  , message = require('./message')
  ;

var API = { 'CreateQueue': queue.create
          , 'ListQueues' : queue.list
          , 'SetQueueAttributes': queue.set
          , 'GetQueueAttributes': queue.get
          , 'SendMessage'   : queue.send
          , 'ReceiveMessage': queue.receive
          , 'ChangeMessageVisibility': message.change_visibility
          , 'DeleteMessage' : message.del

          // Unofficial object API
          , 'Db'     : couch.Database
          , 'Queue'  : queue.Queue
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
      given_opts = lib.opt_def(given_opts);
      lib.copy(opts, given_opts, function(k) { return !(k in given_opts) });
      arguments[0] = given_opts;
      return api_val.apply(this, arguments);
    }

    default_wrapper.prototype = api_val.prototype;
    new_api[name] = default_wrapper;
  })

  return new_api;
}

module.exports = with_defaults({});
module.exports.defaults = with_defaults;
