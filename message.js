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

  self.MessageId   = opts.MessageId   || opts._id || null;
  self.Body        = opts.MessageBody || opts._str || null;
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


function receive(queue, opts, cb) {
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

      var messages = view.rows;
      cb(null, messages);
    })
  })
}

module.exports = { "Message" : Message
                 , "receive" : receive
                 };


//
// Utilities
//
