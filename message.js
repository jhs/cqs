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
  assert.equal(self.MessageId, self.mvcc._id);
  assert.ok('ApproximateReceiveCount'          in self, util.inspect(self));
  assert.ok('ApproximateFirstReceiveTimestamp' in self);

  self.queue.confirmed(function(er) {
    if(er) return callback(er);

    var doc = lib.JDUP(self.mvcc);
    lib.copy(self, doc, function(k) { return /^[A-Z]/.test(k) });
    delete doc.MessageId; // _id is used instead

    doc.ReceiverId = self.queue.db.couch.userCtx.name;
    doc.ApproximateReceiveCount += 1;
    if(doc.ApproximateFirstReceiveTimestamp === null)
      doc.ApproximateFirstReceiveTimestamp = new Date;

    var timeout = self.VisibilityTimeout || self.queue.DefaultVisibilityTimeout;
    var visible_at = new Date;
    visible_at.setSeconds(visible_at.getSeconds() + timeout);
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

Message.prototype.import_doc = function(doc) {
  var self = this;

  lib.copy(doc, self, 'uppercase');
}

function receive(queue, opts, cb) {
  if(!cb && typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  assert.ok(cb);

  if(typeof opts === 'number')
    opts = { 'MaxNumberOfMessages': opts };

  queue.confirmed(function(er) {
    if(er) return cb(er);

    opts.MaxNumberOfMessages = opts.MaxNumberOfMessages || 1;
    opts.VisibilityTimeout = opts.VisibilityTimeout || queue.DefaultVisibilityTimeout;

    var startkey = lib.JS([ "" ]);
    var endkey   = lib.JS([ new Date ]); // Anything becoming visible up to now.
    var query = querystring.stringify({ reduce: false
                                      , limit : opts.MaxNumberOfMessages
                                      , startkey: startkey
                                      , endkey: endkey
                                      });
    var path = lib.enc_id(queue.ddoc_id) + '/_view/visible_at?' + query;
    queue.db.request(path, function(er, resp, view) {
      if(er) return cb(er);

      if(view.rows.length === 0)
        return cb(null, []);

      // Don't lose the order CouchDB set for the messages.
      var messages = [], count = 0;
      function on_receive(er, pos, msg) {
        if(er)
          queue.log.error('Receive error', er);

        messages[pos] = msg || null;

        count += 1;
        if(count === view.rows.length) {
          messages = messages.filter(function(x) { return !!x });
          cb(null, messages);
        }
      }

      view.rows.forEach(function(row, i) {
        var message = new Message(row.value);
        message.queue = queue;
        message.mvcc = {'_id':row.value._id, '_rev':row.value._rev};
        message.receive(function(er) { on_receive(er, i, message) });
      })
    })
  })
}

function send(queue, opts, cb) {
  return queue.SendMessage(opts, cb);
}

module.exports = { "Message" : Message
                 , "receive" : receive
                 , "send"    : send
                 };


//
// Utilities
//
