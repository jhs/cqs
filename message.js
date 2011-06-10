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
  self.MessageBody = opts.MessageBody || null;
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

    var doc = { '_id'          : doc_id
              , 'SenderId'     : sender_id
              , 'SentTimestamp': now
              , 'visible_at'   : now
              , 'ApproximateReceiveCount': 0
              , 'ApproximateFirstReceiveTimestamp': null
              };

    // I am thinking, the "official" message is the binary string blob (maybe base64?); however
    // as a shortcut, transformed versions can be used instead. The message body is technically
    // '{"foo":"bar"}' but store it in couch as {"foo":"bar"}. (Perhaps some views can peek into
    // it or something.)
    if(typeof self.MessageBody === 'string')
      doc.body = self.MessageBody;
    else
      doc.json = self.MessageBody;

    //self.log.debug('PUT\n' + util.inspect(doc));
    db.request({method:'PUT',uri:lib.enc_id(doc._id), json:doc}, function(er, resp, result) {
      if(er) return cb(er);

      // TODO: MD5OfMessageBody
      cb(null, self);
    })
  })
}


module.exports = { "Message" : Message
                 };


//
// Utilities
//
