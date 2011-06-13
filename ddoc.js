// Queue design document
//

var fs = require('fs')
  , lib = require('./lib')
  , path = require('path')
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

, views: { "visible_at": { map: visible_at
                         , reduce: '_count'
                         }
         }

, "validate_doc_update": validate_doc_update
}

function validate_doc_update(newDoc, oldDoc, userCtx, secObj) {
  var NAME = "XXX_name_XXX";

  var my_msg_id = XXX_my_msg_id_XXX;

  if(! /^CQS\//.test(newDoc._id)) // A simple test, hopefully future-proof
    throw({forbidden: "This database is for CQS only"});

  var msg_id = my_msg_id(newDoc); // Message ID is the part within the queue namespace.
  if(!msg_id)
    return; // Another ddoc will handle this validation.

  var good_keys = [ "_id", "_rev", "_revisions", "_deleted"
                  , 'SenderId'
                  , 'SentTimestamp'
                  , 'visible_at'
                  , 'ApproximateReceiveCount'
                  , 'ApproximateFirstReceiveTimestamp'
                  , 'MD5OfMessageBody'
                  , 'Body'

                  // Some extensions
                  , 'ReceiverId'
                  ];

  var key;
  for (key in newDoc)
    if(good_keys.indexOf(key) === -1)
      throw({forbidden: "Invalid field: " + key});

  if(newDoc._deleted) {
    if(oldDoc.ReceiverId !== userCtx.name)
      throw {forbidden: 'You may not delete this document'};

    return;
  }

  if(!newDoc.visible_at)
    throw {forbidden: 'Must set visible_at'};

  if(oldDoc) {
    // Checkout ("receive")
    if(newDoc.ReceiverId !== userCtx.name)
      throw({forbidden: 'Must set ReceiverId to your name: ' + JSON.stringify(userCtx.name)});

  } else {
    // Message send
    if(newDoc.SenderId !== userCtx.name)
      throw({forbidden: 'Must set SenderId to your name: ' + JSON.stringify(userCtx.name)});
  }
}

function visible_at(doc) {
  var NAME = "XXX_name_XXX";
  var my_msg_id = XXX_my_msg_id_XXX;
  var key, val, a;

  var msg_id = my_msg_id(doc);
  if(msg_id && doc.visible_at) {
    key = [doc.visible_at];

    // The client must be able to check out ("receive") the message using this view data,
    // which means MVCC stuff and anything else necessary.
    val = {"_id":doc._id, "_rev":doc._rev};
    for(a in doc)
      if(/^[A-Z]/.test(a))
        val[a] = doc[a];

    emit(key, val);
  }
}

//
// API
//

function DDoc (queue) {
  var self = this;
  var now = new Date;

  assert.ok(queue.name);
  assert.ok(queue.VisibilityTimeout);

  self.name = queue.name;
  self.copy_template();

  self._id = "_design/CQS/" + queue.name;
  self.CreatedTimestamp = now;
  self.LastModifiedTimestamp = now;
  self.VisibilityTimeout = queue.VisibilityTimeout;
}

// One common logger for them all, just so it won't get stored in couch.
DDoc.prototype.log = lib.log4js().getLogger('ddoc');
DDoc.prototype.log.setLevel(lib.LOG_LEVEL);

DDoc.prototype.copy_template = function() {
  var self = this;

  if(self.name.length < 1 || self.name.length > 80)
    throw new Error("Queue name exceeds length max of 80: " + self.name.length)

  var ddoc = templated_ddoc(self.name);
  lib.copy(ddoc, self);
}


// Attach the web browser test suite.
DDoc.prototype.add_browser = function(callback) {
  var self = this;

  if(require.isBrowser) {
    // Browsers installing the browser suite is not supported.
    return callback();
  }

  var home = path.dirname(module.filename)
    , include_dirs = [ home 
                     , home + '/test'
                     , home + '/test/browser/node'
                     , home + '/test/browser'
                     ];

  self._attachments = self._attachments || {};
  var requirejs_paths = { 'request' : '../request.jquery'
                        //, 'foo' : 'bar'
                        };

  function finish() {
    var opts = { baseUrl: "cqs"
               , paths  : requirejs_paths
               }
    var boot_js = [ 'require('
                  ,   '// Options'
                  ,   lib.JS(opts) + ','
                  ,   ''
                  ,   '// Modules'
                  ,   lib.JS(['main.js']) + ','
                  ,   ''
                  ,   '// Code to run when ready'
                  ,   'function(main) { return main(); }'
                  , ');'
                  ].join('\n');

    self._attachments['boot.js'] = { content_type: 'application/javascript'
                                   , data        : new Buffer(boot_js).toString('base64')
                                   }
    return callback();
  }

  // Load serially because error handling is simpler.
  get_dir();
  function get_dir() {
    var dir_path = include_dirs.shift();
    if(!dir_path)
      return finish();

    self.log.debug('Fetching files from: ' + dir_path);
    fs.readdir(dir_path, function(er, files) {
      if(er) return callback(er);
      self.log.debug('Files: ' + lib.JS(files));

      files = files.filter(function(file) { return /\.js$/.test(file) || /\.html$/.test(file) });

      get_file();
      function get_file() {
        var filename = files.shift();
        if(!filename)
          return get_dir(); // done with this dir

        self.log.debug('Loading file: ' + filename);
        fs.readFile(dir_path+'/'+filename, null, function(er, content) {
          if(er && er.errno) er = new Error(er.stack); // Make a better stack trace.
          if(er) return callback(er);

          var match , require_re = /\brequire\(['"]([\w\d\-_\/\.]+?)['"]\)/g
            , dependencies = {};
            ;

          if(dir_path === home + '/test' && filename === 'run.js') {
            // Strip the shebang.
            content = content.toString('utf8').split(/\n/).map(function(line) {
              // Replace the line instead of removing it, to keep the line numbers the same.
              return line.replace(/^(#!.*)$/, '// $1');
            }).join('\n');
            content = new Buffer(content);
          }

          if(dir_path === home || dir_path === home + '/test') {
            // Try converting the Node modules to RequireJS on the fly.
            content = content.toString('utf8');
            while(match = require_re.exec(content))
              dependencies[ match[1] ] = true;
            dependencies = Object.keys(dependencies);

            // In order to keep the error message line numbers correct, this makes an ugly final file.
            content = [ 'require.def(function(require, exports, module) {'
                      //, 'var module = {};'
                      //, 'var exports = {};'
                      //, 'module.exports = exports;'
                      , ''
                      , content
                      , '; return(module.exports);'
                      , '}); // define'
                      ].join('');
            content = new Buffer(content);
          }

          var att_dir = dir_path.replace(new RegExp('^' + home + '/?'), "");

          if(att_dir == "" || att_dir == 'test/browser/node')
            att_dir = "cqs/";

          else if(att_dir == 'test')
            att_dir = 'cqs/test/';

          else if(att_dir == 'test/browser')
            att_dir = "";

          else
            return callback(new Error('Unknown directory: ' + att_dir));

          var att = att_dir + filename;
          var type = /\.html$/.test(filename) ? 'text/html; charset=utf-8' : 'application/javascript';
          self._attachments[att] = { 'content_type':type, 'data':content.toString('base64') };

          get_file();
        })
      }
    })
  }
}


module.exports = { "DDoc" : DDoc
                 };


//
// Utilities
//

function templated_ddoc(name) {
  var for_this_ddoc = func_from_template(my_msg_id, {name:name});

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
      return func_from_template(obj, {name:name, my_msg_id:for_this_ddoc});

    else
      return lib.JDUP(obj);
  }

  return stringify_functions(TEMPLATE);
}

function func_from_template(func, vals) {
  var name = vals.name;
  if(!name || typeof name !== 'string')
    throw new Error('Invalid queue name: ' + util.inspect(name));

  var src = func.toString();
  src = src.replace(/^function.*?\(/, 'function (');

  src = src.replace(/XXX_(.*?)_XXX/g, function(match, key) {
    return vals[key];
  })
  return src;
}

function my_msg_id(doc) {
  var match = /^CQS\/XXX_name_XXX\/([\w\-]+)$/.exec(doc._id);
  return match && match[1];
}
