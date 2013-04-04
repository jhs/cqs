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

require('defaultable')(module,
  { 'time_C': 1.0
  , 'strictSSL': true
  }, function(module, exports, DEFS, require) {

var lib = require('./lib')
  , util = require('util')
  , couch = require('./couch')
  , queue = require('./queue')
  , message = require('./message')
  ;

module.exports =
          { 'CreateQueue': queue.create
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
          };

}) // defaultable
