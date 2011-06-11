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

  // Attach the web browser test suite.
  var fs, path, home;
  if(self.skip_browser)
    go();
  else {
    fs = require('fs');
    path = require('path');
    home = path.dirname(module.filename);
    fs.readdir(home, function(er, files) {
      if(er) return callback(er);
      files = files.filter(function(file) { return /\.js$/.test(file) })
      files.push('test/browser/test.html');
      files.push('test/browser/require.js');
      files.push('test/browser/boot.js');

      var found = {};
      function on_found(er, file_path, content) {
        if(er) {
          found = null;
          return callback(er);
        }

        if(!found)
          return;

        var attachment_path = file_path
                              .replace(/^(\w+\.js)$/, "lib/$1")
                              .replace(/^test\/browser\//, "");

        var match, module_name
          , require_re = /\brequire\(['"]([\w\d\-_\/\.]+?)['"]\)/g
          , dependencies = {}
          ;

        if(/^lib\//.test(attachment_path)) {
          // Try converting the Node modules to RequireJS on the fly.

          content = content.toString('utf8');
          while(match = require_re.exec(content)) {
            module_name = match[1];
            dependencies[module_name] = true;
          }

          dependencies = Object.keys(dependencies);
          content = [ 'define(' + lib.JS(dependencies) + ', function() {'
                    , 'var module = {};'
                    , 'var exports = {};'
                    , 'module.exports = exports;'
                    , ''
                    , content
                    , '; return(module.exports);'
                    , '}); // define'
                    ].join('\n');
          content = new Buffer(content);
        }

        found[attachment_path] = { data: content.toString('base64')
                                 , content_type: /\.html$/.test(file_path) ? 'text/html; charset=utf-8' : 'application/javascript'
                                 }

        if(Object.keys(found).length === files.length) {
          ddoc._attachments = ddoc._attachments || {};
          lib.copy(found, ddoc._attachments);
          go();
        }
      }

      files.forEach(function(file) {
        fs.readFile(file, null, function(er, content) {
          on_found(er, file, content);
        })
      })
    })
  }

  function go() {
    // TODO var html
    var req = { method: 'PUT'
              , uri   : lib.enc_id(ddoc._id)
              , json  : ddoc
              }
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

Queue.prototype.receive = function receive_message(opts, cb) {
  var self = this;

  if(typeof opts === 'function') {
    cb = opts;
    opts = 1;
  }

  message.receive(self, opts, cb);
}


Queue.prototype.SetAttributes = function set_attrs(opts, callback) {
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
  return queue.SetAttributes(attrs, callback);
}

function get_attributes(opts, attrs, callback, extra) {
  var queue = (opts instanceof Queue) ? opts : new Queue(opts);
  return queue.GetAttributes(attrs, callback, extra);
}

function send_message(opts, message, callback) {
  var queue = (opts instanceof Queue) ? opts : new Queue(opts);
  return queue.send(message, callback);
}

module.exports = { "Queue" : Queue
                 , "create": create_queue
                 , "list"  : list_queues
                 , "send"  : send_message
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
