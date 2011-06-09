// Queue
//

var lib = require('./lib')
  , queue_ddoc = require('./ddoc')
  , util = require('util')
  , couch = require('./couch')
  , assert = require('assert')
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

  self.db = new couch.Database(opts);
  self.name = opts.name || opts._str || null;

  self.DefaultVisibilityTimeout = opts.DefaultVisibilityTimeout || DEFAULT_VISIBILITY_TIMEOUT;
}


Queue.prototype.create = function create_queue(cb) {
  var self = this;
  assert.ok(cb);

  var ddoc = new queue_ddoc.DDoc(self);
  var req = { method: 'PUT'
            , uri   : lib.enc_id(ddoc._id)
            , body  : lib.JS(ddoc)
            }
  self.db.request(req, function(er, resp, body) {
    if(er) return cb(er);
    return cb(null, self.name);
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
