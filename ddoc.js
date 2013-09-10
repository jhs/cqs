// Queue design document
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
  {
  }, function(module, exports, DEFS, require) {

var fs = require('fs')
  , lib = require('./lib')
  , path = require('path')
  , util = require('util')
  , debug = require('debug')
  , assert = require('assert')
  , browserify = require('browserify')
  ;


module.exports = { "DDoc" : DDoc

                 // For importing and unit testing.
                 , 'validate_doc_update': validate_doc_update
                 , 'visible_at'         : visible_at
                 , 'enqueue_message'    : enqueue_message
                 }

//
// Constants
//

var TEMPLATE =
  // _id
  // _rev
{ 'queues': {}

, updates: {"queue": enqueue_message}
, views: { "visible_at": { map: visible_at
                         , reduce: '_count'
                         }
         }

, "validate_doc_update": validate_doc_update
}


function enqueue_message(doc, req) {
  if(req.method != 'POST')
    return resp(400, {'error':'Only POST is allowed'})

  if(doc)
    return resp(400, {'error':'Only creating new messages is allowed'})

  try {
    var body = JSON.parse(req.body)
  } catch (er) {
    return resp(400, {'error':'Bad JSON body'})
  }

  // Figure out the queue to update, from .../_update/this_function/queue_name
  var i = req.path.indexOf('_update')
  var queue = req.path[i+2]

  var now = new Date
  doc =
    { _id: 'CQS/' + queue + '/' + req.uuid
    , ApproximateFirstReceiveTimestamp: null
    , ApproximateReceiveCount         : 0
    , Body                            : body
    , SenderId                        : req.userCtx.name
    , SentTimestamp                   : now
    , visible_at                      : now
    }

  //log('Create CQS document: ' + JSON.stringify(doc))
  return resp(201, doc)

  function resp(code, body) {
    if(code != 201)
      doc = null

    return [doc,
      { 'code'   : code
      , 'headers': {'content-type':'application/json'}
      , 'body'   : JSON.stringify(body) + "\n"
      }
    ]
  }
}


function validate_doc_update(newDoc, oldDoc, userCtx, secObj) {
  var ddoc = this
  var msg_id_re = /^CQS\/(.+?)\/([0-9a-f]{32})($|\/(.*)$)/

  var match = newDoc._id.match(msg_id_re)
  if(!match && ddoc.allow_foreign_docs)
    return // Ignore this non-CQS document.
  if(!match)
    throw {'forbidden': 'This database is for CQS only; bad message ID: ' + newDoc._id}

  var queue_id = match[1]
    , msg_id   = match[2]

  if(! (queue_id in ddoc.queues))
    throw {'forbidden':'Queue does not exist: '+queue_id}

  var IS_DB_ADMIN = false;

  secObj.admins = secObj.admins || {};
  secObj.admins.names = secObj.admins.names || [];
  secObj.admins.roles = secObj.admins.roles || [];

  if(userCtx.roles.indexOf('_admin') !== -1)
    IS_DB_ADMIN = true;
  if(secObj.admins.names.indexOf(userCtx.name) !== -1)
    IS_DB_ADMIN = true;
  for(i = 0; i < userCtx.roles; i++)
    if(secObj.admins.roles.indexOf(userCtx.roles[i]) !== -1)
      IS_DB_ADMIN = true;

  var good_keys = [ "_id", "_rev", "_revisions", "_deleted"
                  , 'SenderId'
                  , 'SentTimestamp'
                  , 'visible_at'
                  , 'ApproximateReceiveCount'
                  , 'ApproximateFirstReceiveTimestamp'
                  , 'MD5OfMessageBody'
                  , 'Body'

                  // Some extensions
                  , 'ReceiverId'
                  ];

  var key;
  for (key in newDoc)
    if(good_keys.indexOf(key) === -1)
      throw({forbidden: "Invalid field: " + key});

  if(! newDoc._deleted) {
    if(newDoc.Body === null || newDoc.Body === undefined)
      throw {forbidden: 'Invalid .Body: ' + JSON.stringify(newDoc.Body)};
  } else {
    if(!oldDoc || oldDoc.ReceiverId !== userCtx.name) {
      if(IS_DB_ADMIN)
        log('Allowing db admin "'+userCtx.name+'" to delete: ' + newDoc._id);
      else
        throw {forbidden: 'You may not delete this document'};
    }

    return;
  }

  if(!newDoc.visible_at)
    throw {forbidden: 'Must set visible_at'};

  if(oldDoc) {
    // Checkout ("receive")
    if(newDoc.ReceiverId !== userCtx.name && !IS_DB_ADMIN)
      throw({forbidden: 'Must set ReceiverId to your name: ' + JSON.stringify(userCtx.name)});

  } else {
    // Message send
    if(newDoc.SenderId !== userCtx.name && !IS_DB_ADMIN)
      throw({forbidden: 'Must set SenderId to your name: ' + JSON.stringify(userCtx.name)});
  }
}

function visible_at(doc) {
  var msg_id_re = /^CQS\/(.+?)\/([0-9a-f]{32})($|\/(.*)$)/

  var match = doc._id.match(msg_id_re)
  if(!match || !doc.visible_at)
    return

  var queue_id = match[1]
    , msg_id   = match[2]

  // The client must be able to check out ("receive") the message using this view data,
  // which means MVCC stuff and anything else necessary.
  var val = {"_id":doc._id, "_rev":doc._rev};
  for(var a in doc)
    if(a.match(/^[A-Z]/))
      val[a] = doc[a]

  var key = [queue_id, doc.visible_at]
  emit(key, val)
}

//
// API
//

function DDoc () {
  var self = this;

  self.copy_template();

  self._id = "_design/cqs"
}

// One common logger for them all, just so it won't get stored in couch.
DDoc.prototype.log = debug('cqs:ddoc');

DDoc.prototype.copy_template = function() {
  var self = this;

//  if(self.name.length < 1 || self.name.length > 80)
//    throw new Error("Queue name exceeds length max of 80: " + self.name.length)

  var ddoc = templated_ddoc()
  lib.copy(ddoc, self);
}


// Attach the web browser port.
DDoc.prototype.add_browser = function(callback) {
  if(!browserify){
    return callback(); //we're running in a browser (skip)
  }

  var counter = 1
    , self = this
  
  this._attachments = this._attachments || {}

  ;['showlist.js', 'index.html']
  .forEach(function(name) {
    counter++

    fs.readFile(__dirname + '/browser/' + name, function(err, data) {
      if(err) {
        handleError(err)
      } else {
        var content_type = name.substr(-3) === '.js' ? 'text/javascript' : 'text/html'
        addFile(name, data, content_type)
      }
    })
  })

  var file = ''

  browserify('./') // browserify the current module
    .require('./', {expose: 'cqs'})
    .bundle()
    .on('data', function(data){
      file += data
    })
    .on('error', handleError)
    .on('end', function(){
      addFile('index.js', new Buffer(file), 'text/javascript')
    })

  function handleError(err){
    counter = -1
    callback(err)
  }

  function addFile(name, data, content_type){
    self._attachments[name] = { content_type: content_type
                              , data        : data.toString('base64')
                              }

    if(!--counter)
      callback()
  }
}


//
// Utilities
//

function templated_ddoc(name) {
  return stringify_functions(TEMPLATE)
  function stringify_functions(obj) {
    var copy = {};

    if(Array.isArray(obj))
      return obj.map(stringify_functions)

    else if(typeof obj === 'object' && obj !== null) {
      Object.keys(obj).forEach(function(key) {
        copy[key] = stringify_functions(obj[key]);
      })
      return copy;
    }

    else if(typeof obj === 'function')
      return func_from_template(obj)

    else
      return lib.JDUP(obj);
  }
}

function func_from_template(func) {
  var src = func.toString();
  src = src.replace(/^function.*?\(/, 'function (');
  return src;
}


}, require) // defaultable
