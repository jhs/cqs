// Queue
//

var lib = require('./lib')
  , util = require('util')
  , couch = require('./couch')
  , assert = require('assert')
  ;

//
// Constants
//

//
// API
//

function Queue (opts) {
  var self = this;

  self.db = new couch.Database(opts);
  self.name = opts.name || opts._str || null;
}


Queue.prototype.create = function create_queue(cb) {
  var self = this;
  assert.ok(cb);

  self.db.request({uri:'/stuff'}, function(er, resp, body) {
    if(er) return cb(er);
    return cb(null, body);
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
