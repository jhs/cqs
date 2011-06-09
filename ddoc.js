// Queue design document
//

var lib = require('./lib')
  , util = require('util')
  , assert = require('assert')
  ;

//
// Constants
//

var TEMPLATE =
  // _id
  // _rev
{ ApproximateNumberOfMessages          : 0
, ApproximateNumberOfMessagesNotVisible: 0
, VisibilityTimeout                    : 30
, CreatedTimestamp                     : null
, LastModifiedTimestamp                : null
, Policy                               : null
, MaximumMessageSize                   : 8192
, MessageRetentionPeriod               : 345600
, QueueArn                             : null

, "views": {
           }

, "validate_doc_update": validate_doc_update
}

function validate_doc_update(newDoc, oldDoc, userCtx, secObj) {
  var NAME = "XXX_NAME_XXX";

  if(! /^CQS\//.test(newDoc._id)) // A simple test, hopefully future-proof
    throw({forbidden: "This database is for CQS only"});

  var match = /^CQS\/([a-zA-Z0-9_-]{1,80})\/([a-fA-F0-9]+)$/.exec(newDoc._id);
  if(!match || match[1] !== NAME)
    return; // Another ddoc will handle this validation.

  var good_keys = [ "_id", "_rev", "views", "spatial", "validate_doc_update"
                  , "ApproximateNumberOfMessages"
                  , "ApproximateNumberOfMessagesNotVisible"
                  , "VisibilityTimeout"
                  , "CreatedTimestamp"
                  , "LastModifiedTimestamp"
                  , "Policy"
                  , "MaximumMessageSize"
                  , "MessageRetentionPeriod"
                  , "QueueArn"
                  ];

  var key;
  for (key in newDoc)
    if(good_keys.indexOf(key) === -1)
      throw({forbidden: "Invalid field: " + key});
}

//
// API
//

function DDoc (queue) {
  var self = this;
  var now = new Date;

  assert.ok(queue.name);
  assert.ok(queue.DefaultVisibilityTimeout);
  self.queue = queue;

  self.copy_template();

  self._id = "_design/CQS/" + queue.name;
  self.CreatedTimestamp = now;
  self.LastModifiedTimestamp = now;
  self.DefaultVisibilityTimeout = queue.DefaultVisibilityTimeout;
}


DDoc.prototype.copy_template = function() {
  var self = this;

  if(self.queue.name.length < 1 || self.queue.name.length > 80)
    throw new Error("Queue name exceeds length max of 80: " + self.queue.name.length)

  var ddoc = templated_ddoc(self.queue.name);
  lib.copy(ddoc, self);
}

module.exports = { "DDoc" : DDoc
                 };


//
// Utilities
//

function templated_ddoc(name) {
  function stringify_functions(obj) {
    var copy = {};
    
    if(Array.isArray(obj))
      return obj.map(stringify_functions)

    else if(typeof obj === 'object' && obj !== null) {
      Object.keys(obj).forEach(function(key) {
        copy[key] = stringify_functions(obj[key]);
      })
      return copy;
    }

    else if(typeof obj === 'function')
      return func_from_template(obj, name);

    else
      return lib.JDUP(obj);
  }

  return stringify_functions(TEMPLATE);
}

function func_from_template(func, name) {
  if(!name || typeof name !== 'string')
    throw new Error('Invalid queue name: ' + util.inspect(name));

  var src = func.toString();
  src = src.replace(/^function.*?\(/, 'function (');
  src = src.replace(/XXX_NAME_XXX/g, name);
  return src;
}
