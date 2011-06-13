// Message
//

var lib = require('./lib')
  , util = require('util')
  , couch = require('./couch')
  , assert = require('assert')
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

  lib.copy(opts, self, 'uppercase');

  self.MessageId   = opts.MessageId   || opts._id  || null;
  self.Body        = opts.MessageBody || opts.Body || opts._str || null;
  self.MD5OfMessageBody = null;
  self.queue       = opts.queue       || null;

  self.log = lib.log4js().getLogger('Message/' + (self.MessageId || 'untitled'));
  self.log.setLevel(lib.LOG_LEVEL);
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

    self.MessageId = self.MessageId || uuid;
    var doc_id = 'CQS/' + self.queue.name + '/' + self.MessageId
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

    //self.log.debug('PUT\n' + util.inspect(doc));
    db.request({method:'PUT',uri:lib.enc_id(doc._id), json:doc}, function(er, resp, result) {
      if(er) return cb(er);

      // TODO: MD5OfMessageBody
      cb(null, self);
    })
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

    var doc = lib.JDUP(self.mvcc);
    lib.copy(self, doc, 'uppercase');
    delete doc.MessageId; // _id is used instead
    delete doc.VisibilityTimeout;

    doc.ReceiverId = self.queue.db.couch.userCtx.name;
    doc.ApproximateReceiveCount += 1;
    if(doc.ApproximateFirstReceiveTimestamp === null)
      doc.ApproximateFirstReceiveTimestamp = new Date;

    var timeout = self.VisibilityTimeout || self.queue.VisibilityTimeout;
    var visible_at = new Date;
    visible_at.setMilliseconds(visible_at.getMilliseconds() + (timeout * 1000));
    doc.visible_at = visible_at;

    var path = lib.enc_id(doc._id)
    self.queue.db.request({method:'PUT', uri:path, json:doc}, function(er, resp, result) {
      if(er) return callback(er);

      if(result.ok !== true)
        return callback(new Error('Bad doc update result: ' + lib.JS(result)));

      // Receive was a success.
      delete self.mvcc;
      self.import_doc(doc);
      self.visible_at = visible_at;
      self.ReceiptHandle = {'_id':result.id, '_rev':result.rev};
      callback(null, self);
    })
  })
}

Message.prototype.del = function delete_message(callback) {
  var self = this;
  assert.ok(callback);
  assert.ok(self.queue);
  assert.ok(self.queue.db);
  assert.ok(self.ReceiptHandle, "Must have a ReceiptHandle to delete");

  var id = self.ReceiptHandle._id;
  var req = { method: 'DELETE'
            , uri   : lib.enc_id(id) + '?rev=' + self.ReceiptHandle._rev
            , headers: {'content-type': 'application/json'}
            }
  self.queue.db.request(req, function(er, resp, result) {
    // Note: delete always returns success.
    if(er)
      self.log.info('Failed to delete ' + id + ': ' + er.message);

    if(result.ok !== true)
      self.log.info('Unknown response to delete' + lib.JS(result));

    Object.keys(self).forEach(function (key) {
      if(/^[A-Z]/.test(key))
        delete self[key];
    })
    return callback(null, self);
  })
}

Message.prototype.import_doc = function(doc) {
  var self = this;

  lib.copy(doc, self, 'uppercase');
}


function delete_message(msg, cb) {
  return msg.del(cb);
}

module.exports = { "Message" : Message
                 , "del"  : delete_message
                 };


//
// Utilities
//
