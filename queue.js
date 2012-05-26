// Queue
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

var defaultable = require('defaultable');

defaultable(module,
  { 'visibility_timeout' : 30
  , 'browser_attachments': false
  }, function(module, exports, DEFS, require) {


var lib = require('./lib')
  , txn = require('txn')
  , util = require('util')
  , couch = require('./couch')
  , assert = require('assert')
  , message = require('./message')
  , queue_ddoc = require('./ddoc')
  , querystring = require('querystring')
  ;

//
// Constants
//

var DDOC_ID = '_design/cqs'

//
// API
//

function Queue (opts) {
  var self = this;

  if(typeof opts == 'string')
    opts = {'name':opts};

  opts = defaultable.merge(opts, DEFS);

  self.name = opts.name || opts.QueueName || opts._str || null;
  self.time_C = opts.time_C || null;
  self.db = new couch.Database({'couch':opts.couch, 'db':opts.db, time_C:self.time_C});

  self.VisibilityTimeout = opts.DefaultVisibilityTimeout || opts.VisibilityTimeout || DEFS.visibility_timeout;

  self.cache_confirmation = true;
  self.browser_attachments = !!(opts.browser_attachments);

  self.log = lib.log4js.getLogger('queue/' + (self.name || 'untitled'));
  self.log.setLevel(lib.LOG_LEVEL);
}

Queue.prototype.confirm =
Queue.prototype.confirmed = function after_confirmed(opt, callback) {
  var self = this;

  if(!callback && typeof opt === 'function') {
    callback = opt;
    opt = '';
  }

  assert.ok(callback);
  assert.ok(self.db);

  self.db.confirmed(function(er) {
    if(er)
      return callback(er);

    var confirmer = self.db.known_queues[self.name];
    if(!confirmer || opt === '--force' || !self.cache_confirmation)
      confirmer = self.db.known_queues[self.name] = new lib.Once;

    confirmer.on_done(function(er, ddoc) {
      if(er)
        return callback(er);

      // Copy all attributes from the API.
      self.import_ddoc(ddoc);
      return callback(null, self);
    })

    confirmer.job(confirm_queue);
  })

  function confirm_queue(done) {
    self.log.debug('Confirming queue: ' + self.name);
    self.db.request(lib.enc_id(DDOC_ID), function(er, res) {
      if(er)
        return done(er)

      if(! (self.name in res.body.queues)) {
        if(opt != '--allow-missing')
          return done(new Error('Queue does not exist: ' + self.name))

        self.log.warn('Using non-existent queue: ' + self.name)
        res.body.queues[self.name] = {}
      }

      done(null, res.body)
    })
  }
}

Queue.prototype.create = function create_queue(callback) {
  var self = this;
  assert.ok(callback);

  self.db.confirmed(function(er) {
    if(er)
      return callback(er)
    txn({'couch':self.db.couch.url, 'db':encodeURIComponent(self.db.name), 'id':DDOC_ID, 'create':true}, add_queue, queue_added)
  })

  function add_queue(ddoc, to_txn) {
    //self.log.debug('Add queue to ddoc: %j', ddoc)
    var now = new Date

    if(!ddoc._rev)
      ddoc = new queue_ddoc.DDoc

    ddoc.queues[self.name] = ddoc.queues[self.name] ||
      { ApproximateNumberOfMessages          : 0
      , ApproximateNumberOfMessagesNotVisible: 0
      , VisibilityTimeout                    : self.VisibilityTimeout || 30
      , CreatedTimestamp                     : now
      , LastModifiedTimestamp                : now
      , Policy                               : null
      , MaximumMessageSize                   : 8192
      , MessageRetentionPeriod               : 345600
      , QueueArn                             : null
      }

    if(!self.browser_attachments)
      return to_txn(null, ddoc)
    else
      ddoc.add_browser(function(er) {
        return to_txn(er, ddoc)
      })
  }

  function queue_added(er, new_ddoc) {
    if(er)
      return callback(er)

    self.log.debug('new_ddoc: %j', new_ddoc._id)
    self.log.debug('Created queue: ' + self.name)

    // Consider myself confirmed as well.
    self.db.known_queues[self.name] = new lib.Once
    self.db.known_queues[self.name].job(function(done) { done(null, new_ddoc) })
    self.import_ddoc(new_ddoc)
    callback(null, self.name)
  }
}


Queue.prototype.import_ddoc = function(ddoc) {
  var self = this;
  self.ddoc_id = ddoc._id;
  self.ddoc_rev = ddoc._rev;
  lib.copy(ddoc.queues[self.name], self, 'uppercase');
}


Queue.prototype.send = function(opts, extra, callback) {
  var self = this;

  if(!callback && typeof extra === 'function') {
    callback = extra;
    extra = null;
  }

  self.confirmed(function(er) {
    if(er) return callback(er);

    opts = lib.opt_def(opts);
    var body = opts._str || opts;
    var msg = new message.Message({ 'couch'  : self.couch
                                  , 'db'     : self.db
                                  , 'queue'  : self
                                  , 'IdExtra': extra
                                  , 'Body'   : body
                                  });
    msg.send(callback);
  })
}

Queue.prototype.receive = function(opts, callback) {
  var self = this;

  if(typeof opts === 'function') {
    callback = opts;
    opts = 1;
  }

  if(typeof opts === 'number')
    opts = {'MaxNumberOfMessages': opts};

  var msg_count   = opts.MaxNumberOfMessages || 1;
  var vis_timeout = opts.VisibilityTimeout || self.VisibilityTimeout;
  var is_heartbeat = opts.is_heartbeat || false;

  assert.ok(msg_count > 0  , "Message count is too low");
  assert.ok(msg_count <= 10, "Message count is too high");
  assert.ok(vis_timeout >= 0, "Visibility timeout is too low");
  assert.ok(vis_timeout <= 43200, "Visibility timeout is too high");

  self.confirmed(function(er) {
    if(er) return callback(er);

    var startkey = lib.JS([ self.name, "" ]);
    var endkey   = lib.JS([ self.name, new Date ]); // Anything becoming visible up to now.
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
        if(er && er.statusCode != 409 && er.error != 'conflict') {
          self.log.debug('Receive error: ' + er);
          return callback(er);
        }

        if(er && er.statusCode == 409 && er.error == 'conflict') {
          self.log.debug('Missed message '+pos+': ' + msg.MessageId);
          msg = null;
        }

        messages[pos] = msg || null;

        count += 1;
        if(count === view.rows.length) {
          messages = messages.filter(function(x) { return !!x });
          callback(null, messages);
        }
      }

      view.rows.forEach(function(row, i) {
        var match = new RegExp('^CQS/' + self.name + '/' + '(.+)$').exec(row.value._id);
        assert.ok(match, "Bad view row: " + lib.JS(row)); // TODO: This does not belong in async code.

        var msg_opts = {};
        lib.copy(row.value, msg_opts, 'uppercase');
        msg_opts.MessageId = match[1];

        var msg = new message.Message(msg_opts);
        msg.queue = self;
        msg.VisibilityTimeout = vis_timeout;
        msg.is_heartbeat      = is_heartbeat;
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

  opts = lib.JDUP(opts)

  self.log.debug('Set attributes: ' + self.name);
  self.confirmed('--force', function(er) {
    if(er)
      return callback(er)


    function go(er) {
      if(er) return callback(er);

      var req = { method: 'PUT'
                , uri   : lib.enc_id(ddoc._id)
                , json  : ddoc
                }
      self.db.request(req, function(er, resp, body) {
        if(er) return callback(er);
      })
    }
  })

  self.db.confirmed(function(er) {
    if(er)
      return callback(er)
    txn({'couch':self.db.couch.url, 'db':encodeURIComponent(self.db.name), 'id':DDOC_ID}, update_attrs, attrs_updated)
  })

  function update_attrs(ddoc, to_txn) {
    //self.log.debug('Update queue on ddoc: %j', ddoc)
    var now = new Date
      , queue = ddoc.queues[self.name]

    lib.copy(opts, queue, 'uppercase');
    queue.LastModifiedTimestamp = now

    if(!self.browser_attachments)
      return to_txn()
    else
      ddoc.add_browser(to_txn)
  }

  function attrs_updated(er, new_ddoc) {
    if(er)
      return callback(er)

    // SetAttributes was committed, consider myself confirmed as well.
    self.db.known_queues[self.name] = new lib.Once;
    self.db.known_queues[self.name].job(function(done) { done(null, new_ddoc) });
    self.import_ddoc(new_ddoc);
    callback(null)
  }
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

  self.log.debug('Get attributes: ' + self.name);
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
  if(!cb && typeof opts == 'function') {
    cb = opts;
    opts = {};
  }

  if(typeof opts == 'string')
    opts = {'prefix':opts};
  opts = defaultable.merge(opts, DEFS);
  var prefix = opts.prefix || opts._str;

  if(!cb && opts._func)
    cb = opts._func;

  prefix = new RegExp('^' + (prefix || ""))

  var ddoc_url = opts.couch + '/' + encodeURIComponent(opts.db) + '/' + lib.enc_id(DDOC_ID)
  lib.req_json({'url':ddoc_url, time_C:opts.time_C}, function(er, res) {
    if(er)
      return cb(er)

    var queues = Object.keys(res.body.queues)
      .filter(function(name) { return !! name.match(prefix) })
      .map(get_queue)

    return cb(null, queues)

    function get_queue(name) {
      return new Queue({ couch: opts.couch
                       , db   : opts.db
                       , name : name
                       , time_C: opts.time_C
                       })
    }
  })
}


function set_attributes(queue, attrs, callback) {
  return queue.set(attrs, callback);
}

function get_attributes(opts, attrs, callback, extra) {
  var queue = (opts instanceof Queue) ? opts : new Queue(opts);
  return queue.GetAttributes(attrs, callback, extra);
}

function send_message(opts, message, extra, callback) {
  var queue;
  if(opts instanceof Queue)
    queue = opts;
  else if(opts.queue) {
    if(opts.queue instanceof Queue)
      queue = opts.queue
    else
      queue = new Queue({'QueueName':opts.queue, 'couch':opts.couch || DEFS.couch, 'db':opts.db || DEFS.db});
  }
  else
    queue = new Queue(opts);

  if(!callback && typeof extra === 'function') {
    callback = extra;
    extra = null;
  }

  return queue.send(message, extra, callback);
}

function receive_message(opts, callback, extra) {
  if(typeof opts == 'string')
    opts = {'queue':opts};

  var queue;
  if(opts instanceof Queue)
    queue = opts;
  else if(opts._str || opts.queue) {
    if(opts.queue instanceof Queue)
      queue = opts.queue;
    else
      queue = new Queue({'QueueName':opts._str || opts.queue, 'couch':opts.couch || DEFS.couch, 'db':opts.db || DEFS.db});
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


}) // defaultable
