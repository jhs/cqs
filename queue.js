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

  self.name = opts.name || opts.QueueName || opts._str || null;
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

Queue.prototype.create = function create_queue(callback) {
  var self = this;
  assert.ok(callback);

  var ddoc = new queue_ddoc.DDoc(self);
  if(self.skip_browser)
    go();
  else
    ddoc.add_browser(go);

  function go(er) {
    if(er) return callback(er);

    var req = { method: 'PUT'
              , uri   : lib.enc_id(ddoc._id)
              , json  : ddoc
              }

    //console.error('Storing\n' + util.inspect(ddoc));
    self.db.request(req, function(er, resp, body) {
      if(er) return callback(er);

      // Consider myself confirmed as well.
      self.import_ddoc(ddoc);
      self.is_confirmed = true;
      return callback(null, self.name);
    })
  }
}


Queue.prototype.import_ddoc = function(ddoc) {
  var self = this;
  self.ddoc_id = ddoc._id;
  self.ddoc_rev = ddoc._rev;
  lib.copy(ddoc, self, 'uppercase');
}


Queue.prototype.send = function send_message(opts, cb) {
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

Queue.prototype.receive = function receive_message(opts, callback) {
  var self = this;

  if(typeof opts === 'function') {
    callback = opts;
    opts = 1;
  }

  var msg_count   = opts.MaxNumberOfMessages || 1;
  var vis_timeout = opts.VisibilityTimeout || self.VisibilityTimeout;

  assert.ok(msg_count > 0  , "Message count is too low");
  assert.ok(msg_count <= 10, "Message count is too high");
  assert.ok(vis_timeout >= 0, "Visibility timeout is too low");
  assert.ok(vis_timeout <= 43200, "Visibility timeout is too high");

  self.confirmed(function(er) {
    if(er) return callback(er);

    var startkey = lib.JS([ "" ]);
    var endkey   = lib.JS([ new Date ]); // Anything becoming visible up to now.
    var query = querystring.stringify({ reduce: false
                                      , limit : msg_count
                                      , startkey: startkey
                                      , endkey: endkey
                                      });
    var path = lib.enc_id(self.ddoc_id) + '/_view/visible_at?' + query;
    self.db.request(path, function(er, resp, view) {
      if(er) return callback(er);

      if(view.rows.length === 0)
        return callback(null, []);

      // Don't lose the order CouchDB set for the messages.
      var messages = [], count = 0;
      function on_receive(er, pos, msg) {
        if(er)
          self.log.error('Receive error', er);

        messages[pos] = msg || null;

        count += 1;
        if(count === view.rows.length) {
          messages = messages.filter(function(x) { return !!x });
          callback(null, messages);
        }
      }

      view.rows.forEach(function(row, i) {
        var match = new RegExp('^CQS/' + self.name + '/' + '(.+)$').exec(row.value._id);
        assert.ok(match, "Bad view row: " + lib.JS(row));

        var msg_opts = {};
        lib.copy(row.value, msg_opts, 'uppercase');
        msg_opts.MessageId = match[1];

        var msg = new message.Message(msg_opts);
        msg.queue = self;
        msg.mvcc = {'_id':row.value._id, '_rev':row.value._rev};
        msg.receive(function(er) { on_receive(er, i, msg) });
      })
    })
  })
}


Queue.prototype.set = function set_attrs(opts, callback) {
  var self = this;
  assert.ok(opts);
  assert.ok(callback);
  assert.equal(typeof opts, 'object');

  self.confirmed('--force', function(er) {
    if(er) return callback(er);

    var ddoc = new queue_ddoc.DDoc(self);
    ddoc._rev = self.ddoc_rev;
    lib.copy(opts, ddoc, 'uppercase');

    if(self.skip_browser)
      go();
    else
      ddoc.add_browser(go);

    function go(er) {
      if(er) return callback(er);

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
    }
  })
}


Queue.prototype.GetAttributes = function get_attrs(attrs, callback, extra) {
  var self = this;

  if(!callback && typeof attrs === 'function') {
    callback = attrs;
    attrs = null;
  }

  var confirmer = function(cb) { return self.confirmed(cb) };
  if(attrs === '--force') {
    confirmer = function(cb) { return self.confirmed('--force', cb) };
    attrs = callback;
    callback = extra;
  }

  if(typeof attrs === 'string')
    attrs = [attrs];

  attrs = attrs || ['all'];
  assert.ok(Array.isArray(attrs));
  assert.ok(callback);

  confirmer(function(er) {
    if(er) return callback(er);
    callback(null, self);
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


function set_attributes(queue, attrs, callback) {
  return queue.set(attrs, callback);
}

function get_attributes(opts, attrs, callback, extra) {
  var queue = (opts instanceof Queue) ? opts : new Queue(opts);
  return queue.GetAttributes(attrs, callback, extra);
}

function send_message(opts, message, callback) {
  var queue;
  if(opts instanceof Queue)
    queue = opts;
  else if(opts.queue) {
    if(opts.queue instanceof Queue)
      queue = opts.queue
    else
      queue = new Queue({'QueueName':opts.queue, 'couch':opts.couch, 'db':opts.db});
  }
  else
    queue = new Queue(opts);

  if(!callback && typeof message === 'function') {
    callback = message;
    message = {'MessageBody':opts.MessageBody, 'MessageId': opts.MessageId};
  }

  return queue.send(message, callback);
}

function receive_message(opts, callback, extra) {
  var queue;
  if(opts instanceof Queue)
    queue = opts;
  else if(opts._str || opts.queue) {
    if(opts.queue instanceof Queue)
      queue = opts.queue;
    else
      queue = new Queue({'QueueName':opts._str || opts.queue, 'couch':opts.couch, 'db':opts.db});
    delete opts.queue;
    delete opts._str;
  } else
    Queue = new Queue(opts);

  if(typeof callback === 'number' && typeof extra === 'function') {
    opts= { 'MaxNumberOfMessages': callback };
    callback = extra;
  }

  assert.ok(callback);
  return queue.receive(opts, callback);
}

module.exports = { "Queue" : Queue
                 , "create": create_queue
                 , "list"  : list_queues
                 , "send"  : send_message
                 , "receive": receive_message
                 , "set"   : set_attributes
                 , "get"   : get_attributes
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
