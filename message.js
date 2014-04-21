// Message
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

var lib = require('./lib')
  , util = require('util')
  , couch = require('./couch')
  , events = require('events')
  , assert = require('assert')
  , debug = require('debug')
  , querystring = require('querystring')
  ;

//
// Constants
//

//
// API
//

function Message (opts) {
  var self = this;
  events.EventEmitter.call(self);

  lib.copy(opts, self, 'uppercase');

  self.MessageId   = opts.MessageId   || opts._id  || null;
  self.Body        = opts.MessageBody || opts.Body || opts._str || null;
  self.MD5OfMessageBody = null;
  self.IdExtra     = opts.IdExtra     || null;
  self.queue       = opts.queue       || null;
  self.is_heartbeat= opts.is_heartbeat|| false;
  self.seq         = opts.seq         || null;

  self.log = debug('cqs:message:' + (self.MessageId || 'untitled'));
}
util.inherits(Message, events.EventEmitter);


Message.prototype.assert_received = function assert_received() {
  var self = this;
  assert.ok(self.queue        , 'Message not usable (no queue)');
  assert.ok(self.queue.db     , 'Message not usable (no queue db)');
  assert.ok(self.ReceiptHandle, 'Message not usable (no ReceiptHandle)');
}

Message.prototype.make_doc = function() {
  var self = this;

  var doc = lib.JDUP(self.mvcc || {});
  lib.copy(self, doc, 'uppercase');
  delete doc.MessageId; // _id is used instead
  delete doc.IdExtra;
  delete doc.VisibilityTimeout;
  delete doc.ReceiptHandle;

  return doc;
}


Message.prototype.send = function send_message(cb) {
  var self = this;
  assert.ok(cb);
  assert.ok(self.queue);
  assert.ok(self.queue.db);
  assert.ok(self.queue.db.couch);

  // Take advantage of the couch query to cache the userCtx a.k.a. pre-confirm before this query.
  var db = self.queue.db;
  db.couch.uuid(function(er, uuid) {
    if(er) return cb(er);

    var message_id = self.MessageId || uuid;
    if(typeof self.IdExtra === 'string')
      message_id += '/' + self.IdExtra;

    var doc_id = 'CQS/' + self.queue.name + '/' + message_id
      , sender_id = db.couch.userCtx.name
      , now = new Date
      ;

    // Unlike SQS, but like CouchDB, message bodies are structured (JSON), not just a string blob.
    var doc = { '_id'          : doc_id
              , 'SenderId'     : sender_id
              , 'SentTimestamp': now
              , 'visible_at'   : now
              , 'ApproximateReceiveCount': 0
              , 'ApproximateFirstReceiveTimestamp': null
              , 'Body'         : self.Body
              };

    //self.log = debug('PUT\n' + util.inspect(doc));
    db.request({method:'PUT',uri:lib.enc_id(doc._id), json:doc}, function(er, resp, result) {
      if(er) return cb(er);

      // The send was committed.
      self.MessageId = message_id;
      // TODO: MD5OfMessageBody

      cb(null, self);
    })
  })
}


Message.prototype.update = function update_message(callback) {
  var self = this;
  assert.ok(callback)
  assert.ok(callback);
  assert.ok(self.queue);
  assert.ok(self.queue.db);

  var doc_id = lib.enc_id('CQS/' + self.queue.name + '/' + self.MessageId);
  self.queue.db.request({'uri':doc_id, 'couch_errors':true}, function(er, resp, doc) {
    if(er)
      return callback(er);

    var key;
    if(resp.statusCode === 200)
      lib.copy(doc, self, 'uppercase');
    else {
      // This message was deleted;
      for (key in self)
        if(/^[A-Z]/.test(key))
          delete self[key];
      self.deleted = true;
    }

    // TODO: Detect if visible_at changed and update the alerts.
    return callback(null, self);
  })
}

Message.prototype.receive = function receive_message(callback) {
  var self = this;
  assert.ok(callback);
  assert.ok(self.queue);
  assert.ok(self.queue.db);
  assert.ok(self.queue.db.couch);

  assert.ok(self.mvcc);
  assert.ok(self.mvcc._id);
  assert.ok(new RegExp('/' + self.MessageId + '$').test(self.mvcc._id), lib.JS({_id:self.mvcc._id, ID:self.MessageId}));
  assert.ok('ApproximateReceiveCount'          in self, util.inspect(self));
  assert.ok('ApproximateFirstReceiveTimestamp' in self);

  self.queue.confirmed(function(er) {
    if(er) return callback(er);

    var doc = self.make_doc();
    doc.ReceiverId = self.queue.db.couch.userCtx.name;
    doc.ApproximateReceiveCount += 1;
    if(doc.ApproximateFirstReceiveTimestamp === null)
      doc.ApproximateFirstReceiveTimestamp = new Date;

    var timeout = self.VisibilityTimeout || self.queue.VisibilityTimeout;
    var visible_at = new Date;
    visible_at.setUTCMilliseconds(visible_at.getUTCMilliseconds() + (timeout * 1000));
    doc.visible_at = visible_at;

    var path = lib.enc_id(doc._id)
    self.queue.db.request({method:'PUT', uri:path, json:doc}, function(er, resp, result) {
      if(er) return callback(er);

      if(result.ok !== true)
        return callback(new Error('Bad doc update result: ' + lib.JS(result)));

      // Receive was a success.
      doc._rev = result.rev;
      self.reset(doc, visible_at);
      callback(null, self);
    })
  })
}

Message.prototype.reset = function(doc, new_visible_at) {
  var self = this;

  if(doc && new_visible_at) {
    delete self.mvcc;
    self.import_doc(doc);
    self.visible_at = new_visible_at;
    self.ReceiptHandle = {'_id':doc._id, '_rev':doc._rev};
  }

  self.receive_timers = self.receive_timers || [];
  self.receive_timers.forEach(function(timer) {
    clearTimeout(timer);
  })
  self.receive_timers = [];

  var reset_at = new Date
    , receipt_ms = new_visible_at - reset_at
    , warning_interval_ms, a, warner
    ;

  if(new_visible_at && self.is_heartbeat) {
    for(a = 1; a <= 12; a++) {
      warning_interval_ms = receipt_ms * (a / 12);
      warner = setTimeout(on_warn, warning_interval_ms);
      self.receive_timers.push(warner);
    }
  }

  function on_warn() {
    var interval_at = new Date
      , elapsed_ms = interval_at - reset_at
      , elapsed_pc = 100 * elapsed_ms / receipt_ms
      ;
    self.emit('heartbeat', elapsed_pc);
  }
}

Message.prototype.visibility =
Message.prototype.change_visibility = function (new_time, callback) {
  var self = this;

  assert.ok(callback);
  try        { self.assert_received() }
  catch (er) { return callback(er)    }

  var delta_ms, now = new Date;

  if(typeof new_time === 'number') {
    // Caller requests now + the given seconds.
    delta_ms = new_time * 1000;
    new_time = new Date;
    new_time.setUTCMilliseconds(new_time.getUTCMilliseconds() + delta_ms);
  } else {
    delta_ms = new_time - now;
    if(delta_ms < 0)
      return callback(new Error('Requested change ' + lib.JS(new_time) + ' is too late'));
    if(delta_ms < 2000)
      return callback(new Error('Requested change ' + lib.JS(new_time) + ' is less than 2s from now'));
  }

  self.mvcc = {'_id': self.ReceiptHandle._id, '_rev': self.ReceiptHandle._rev};
  var doc = self.make_doc();
  doc.visible_at = new_time;

  var path = lib.enc_id(doc._id)
  self.queue.db.request({method:'PUT', uri:path, json:doc}, function(er, resp, result) {
    if(er) return callback(er);

    if(result.ok !== true)
      return callback(new Error('Bad doc update result: ' + lib.JS(result)));

    // Update was a success.
    doc._rev = result.rev;
    self.reset(doc, new_time);
    callback(null, self);
  })
}

Message.prototype.del = function message_del(callback) {
  var self = this;

  assert.ok(callback);
  try        { self.assert_received() }
  catch (er) { return callback(er)    }

  var id = self.ReceiptHandle._id;
  var req = { method: 'DELETE'
            , uri   : lib.enc_id(id) + '?rev=' + self.ReceiptHandle._rev
            , headers: {'content-type': 'application/json'}
            }
  self.queue.db.request(req, function(er, resp, result) {
    // Note: delete always returns success.
    if(er)
      self.log = debug('Failed to delete ' + id + ': ' + er.message);

    if(!result || result.ok !== true)
      self.log = debug('Unknown response to delete' + lib.JS(result));

    Object.keys(self).forEach(function (key) {
      if(/^[A-Z]/.test(key))
        delete self[key];
    })

    self.reset();
    return callback(null, self);
  })
}

Message.prototype.import_doc = function(doc) {
  var self = this;

  lib.copy(doc, self, 'uppercase');
}


function change_visibility(opts, VisibilityTimeout, callback) {
  var message;
  if(lib.instanceof(opts, Message))
    message = opts;
  else if(opts.ReceiptHandle)
    return callback(new Error('ReceiptHandle is unsupported, use "Message" instead with message object'));
  else if(opts.Message || opts.message)
    message = opts.Message || opts.message;
  else
    return callback(new Error('Unknown options: ' + lib.JS(opts)));

  return message.change_visibility(VisibilityTimeout, callback);
}

function delete_message(msg, cb) {
  return msg.del(cb);
}

module.exports = { "Message" : Message
                 , "change_visibility"  : change_visibility
                 , "del"     : delete_message
                 };


//
// Utilities
//

}, require) // defaultable
