// Queue
//

var lib = require('./lib')
  , util = require('util')
  , couch = require('./couch')
  , assert = require('assert')
  , events = require('events')
  , message = require('./message')
  , queue_ddoc = require('./ddoc')
  , querystring = require('querystring')
  ;

//
// Constants
//

var DEFAULT_VISIBILITY_TIMEOUT = 30;
var QUEUE_DDOC_ID_RE           = /^_design\/CQS\/([a-zA-Z0-9_-]{1,80})$/;

//
// API
//

function Queue (opts) {
  var self = this;

  self.name = opts.name || opts._str || null;
  self.db = new couch.Database({'couch':opts.couch, 'db':opts.db});

  self.DefaultVisibilityTimeout = opts.DefaultVisibilityTimeout || DEFAULT_VISIBILITY_TIMEOUT;

  self.is_confirmed = false;

  self.log = lib.log4js().getLogger('queue/' + (self.name || 'untitled'));
  self.log.setLevel(lib.LOG_LEVEL);
}

Queue.prototype.confirm =
Queue.prototype.confirmed = function after_confirmed(cb) {
  var self = this;
  assert.ok(cb);

  if(self.is_confirmed)
    return cb(null, self);

  var doc_id = new queue_ddoc.DDoc(self).id;
  self.db.request(lib.enc_id(doc_id), function(er, resp, ddoc) {
    if(er) return cb(er);

    // Otherwise, copy all attributes from the API.
    self.ddoc_id = doc_id;
    lib.copy(ddoc, self, function(k) { return /^[A-Z]/.test(k) });
    self.is_confirmed = true;
    cb(null, self);
  })
}

Queue.prototype.create = function create_queue(cb) {
  var self = this;
  assert.ok(cb);

  var ddoc = new queue_ddoc.DDoc(self);
  var req = { method: 'PUT'
            , uri   : lib.enc_id(ddoc.id)
            , json  : ddoc
            }
  self.db.request(req, function(er, resp, body) {
    if(er) return cb(er);

    // Consider myself confirmed as well.
    self.ddoc_id = ddoc.id;
    lib.copy(ddoc, self, function(k) { return /^[A-Z]/.test(k) });
    self.is_confirmed = true;
    return cb(null, self.name);
  })
}


Queue.prototype.SendMessage = function send_message(opts, cb) {
  var self = this;

  self.confirmed(function() {
    var msg = new message.Message(opts);
    msg.queue = self;
    msg.send(cb);
  })
}

Queue.prototype.ReceiveMessage = function receive_message(opts, cb) {
  var self = this;

  if(typeof opts === 'function') {
    cb = opts;
    opts = 1;
  }

  assert.ok(cb);

  if(typeof opts === 'number')
    opts = { 'MaxNumberOfMessages': opts };

  self.confirmed(function(er) {
    if(er) return cb(er);

    opts.MaxNumberOfMessages = opts.MaxNumberOfMessages || 1;
    opts.VisibilityTimeout = opts.VisibilityTimeout || self.DefaultVisibilityTimeout;

    var endkey = [ lib.JS(new Date) ]; // Anything becoming visible up to now.

    var query = querystring.stringify({ reduce: false
                                      , limit : opts.MaxNumberOfMessages
                                      , endkey: endkey
                                      });
    var path = lib.enc_id(self.ddoc_id) + '/_view/visibility_at?' + query;
    self.db.request(path, function(er, resp, view) {
      if(er) return cb(er);

      var messages = view.rows;
      cb(null, messages);
    })
  })
}


function create_queue(opts, cb) {
  var queue = new Queue(opts);
  queue.create(function(er, name) {
    if(er) return cb(er);
    return cb(null, queue);
  })
}


function list_queues(opts, cb) {
  var prefix = opts.prefix || opts._str;

  if(!cb && opts._func)
    cb = opts._func;

  var startkey = '_design/CQS\/';
  var endkey   = '_design/CQS\/';

  if(prefix) {
    startkey += prefix;
    endkey   += prefix;
  }

  endkey += '\ufff0';

  var query = { startkey: lib.JS(startkey)
              , endkey  : lib.JS(endkey)
              };

  var db_url = opts.couch + '/' + opts.db;
  var view = db_url + '/_all_docs?' + querystring.stringify(query);
  lib.req_json(view, function(er, resp, view) {
    if(er) return cb(er);

    function get_queue(row) {
      return new Queue({ couch: opts.couch
                       , db   : opts.db
                       , name : id_to_name(row.id)
                       })
    }

    var queues = view.rows.map(get_queue);
    return cb(null, queues);
  })
}


module.exports = { "Queue" : Queue
                 , "CreateQueue": create_queue
                 , "ListQueues" : list_queues
                 };


//
// Utilities
//

function id_to_name(id) {
  var match = QUEUE_DDOC_ID_RE.exec(id);
  if(!match)
    throw new Error("Unknown queue ddoc id: " + id);
  return match[1];
}
