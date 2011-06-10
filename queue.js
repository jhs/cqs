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

  self.VisibilityTimeout = opts.DefaultVisibilityTimeout || opts.VisibilityTimeout || DEFAULT_VISIBILITY_TIMEOUT;

  self.is_confirmed = false;
  self.cache_confirmation = true;

  self.log = lib.log4js().getLogger('queue/' + (self.name || 'untitled'));
  self.log.setLevel(lib.LOG_LEVEL);
}

Queue.prototype.confirm =
Queue.prototype.confirmed = function after_confirmed(opt, cb) {
  var self = this;

  if(!cb && typeof opt === 'function') {
    cb = opt;
    opt = '';
  }

  assert.ok(cb);

  if(opt === '--force' || self.cache_confirmation === false) {
    self.log.debug('Clearing cache: ' + self.name);
    self.is_confirmed = false;
  }

  if(self.is_confirmed)
    return cb(null, self);

  self.log.debug('Confirming: ' + self.name);
  var doc_id = new queue_ddoc.DDoc(self)._id;
  self.db.request(lib.enc_id(doc_id), function(er, resp, ddoc) {
    if(er) return cb(er);

    // Otherwise, copy all attributes from the API.
    self.import_ddoc(ddoc);
    self.is_confirmed = true;
    cb(null, self);
  })
}

Queue.prototype.create = function create_queue(cb) {
  var self = this;
  assert.ok(cb);

  var ddoc = new queue_ddoc.DDoc(self);
  var req = { method: 'PUT'
            , uri   : lib.enc_id(ddoc._id)
            , json  : ddoc
            }
  self.db.request(req, function(er, resp, body) {
    if(er) return cb(er);

    // Consider myself confirmed as well.
    self.import_ddoc(ddoc);
    self.is_confirmed = true;
    return cb(null, self.name);
  })
}

Queue.prototype.import_ddoc = function(ddoc) {
  var self = this;
  self.ddoc_id = ddoc._id;
  self.ddoc_rev = ddoc._rev;
  lib.copy(ddoc, self, 'uppercase');
}


Queue.prototype.SendMessage = function send_message(opts, cb) {
  var self = this;

  self.confirmed(function(er) {
    if(er) return cb(er);

    opts = lib.opt_def(opts);
    lib.copy({couch:self.couch, db:self.db}, opts);
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

  message.receive(self, opts, cb);
}


Queue.prototype.SetAttributes = function set_attribs(opts, callback) {
  var self = this;
  assert.ok(opts);
  assert.ok(callback);
  assert.equal(typeof opts, 'object');

  self.confirmed('--force', function(er) {
    if(er) return callback(er);

    var ddoc = new queue_ddoc.DDoc(self);
    ddoc._rev = self.ddoc_rev;
    lib.copy(opts, ddoc, 'uppercase');

    var req = { method: 'PUT'
              , uri   : lib.enc_id(ddoc._id)
              , json  : ddoc
              }
    self.db.request(req, function(er, resp, body) {
      if(er) return callback(er);

      // SetAttributes was committed.
      lib.copy(opts, self, 'uppercase');
      return callback(null);
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


function set_attributes(queue, attribs, callback) {
  return queue.SetAttributes(attribs, callback);
}


module.exports = { "Queue" : Queue
                 , "CreateQueue": create_queue
                 , "ListQueues" : list_queues
                 , "SetAttributes": set_attributes
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
