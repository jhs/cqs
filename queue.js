// Queue
//

var lib = require('./lib')
  , queue_ddoc = require('./ddoc')
  , util = require('util')
  , couch = require('./couch')
  , assert = require('assert')
  ;

//
// Constants
//

var DEFAULT_VISIBILITY_TIMEOUT = 30;

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
  queue.create(cb);
}

module.exports = { "Queue" : Queue
                 , "CreateQueue": create_queue
                 };


//
// Utilities
//
