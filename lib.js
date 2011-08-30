// Utility library
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

var request = require('request')
  , events = require('events')
  ;

exports.LOG_LEVEL = process.env.cqs_log_level || "info";

exports.scrub_creds = function scrub_creds(url) {
  return url.replace(/^(https?:\/\/)[^:]+:[^@]+@(.*)$/, '$1$2'); // Scrub username and password
}

exports.JP = JSON.parse;
exports.JS = JSON.stringify;
exports.JDUP = function(obj) { return JSON.parse(JSON.stringify(obj)) };

exports.copy = function(src, dst, pred) {
  pred = pred || function() { return true };
  if(pred === 'uppercase')
    pred = function(key) { return /^[A-Z]/.test(key) };

  Object.keys(src).forEach(function(key) {
    var val = src[key];
    if(pred(key, val))
      dst[key] = val;
  })
}

exports.opt_def = function(opts) {
  if(typeof opts === 'string')
    opts = {'_str': opts};
  else if(typeof opts === 'function')
    opts = {'_func': opts};
  return opts;
}

exports.req_json = function req_json(opts, callback) {
  if(typeof opts === 'string')
    opts = {'uri':opts};

  var couch_errors_are_ok = !! opts.couch_errors;

  opts.headers = opts.headers || {};
  opts.headers['accept']       = 'application/json';
  opts.headers['content-type'] = 'application/json';

  if(!('followRedirect' in opts))
    opts.followRedirect = false;

  var started_at = new Date;
  var timer_ms = (opts.timeout || 5000) * (opts.time_C || 1.0);
  delete opts.time_C;

  //console.log('Request timeout will be: ' + timer_ms);
  var timed_out = false, timer = setTimeout(on_timeout, timer_ms);
  function on_timeout() {
    timed_out = true;
    var duration = (new Date) - started_at;
    callback(new Error('Request timeout (' + (duration/1000) + 's) : ' + opts.uri));
  }

  function on_req_done(er, resp, body) {
    clearTimeout(timer);
    if(timed_out)
      return;
    if(er)
      return callback(er);

    if(resp.statusCode < 200 || resp.statusCode >= 300)
      if(! couch_errors_are_ok)
        return callback(new Error('Couch response ' + resp.statusCode + ' to ' + opts.uri + ': ' + body));

    var obj;
    try           { obj = JSON.parse(body) }
    catch (js_er) { return callback(js_er) }

    return callback(null, resp, obj);
  }

  return request(opts, on_req_done);
}

exports.enc_id = function encode_doc_id(id) {
  return encodeURIComponent(id).replace(/^_design%2[fF]/, '_design/');
}

// Wrap log4js so it will not be a dependency.
var VERBOSE = !!process.env.verbose;

var noop = function() {};
var noops = { "trace": noop
            , "debug": VERBOSE ? console.log   : noop
            , "info" : console.info
            , "warn" : console.warn
            , "error": console.error
            , "fatal": console.error

            , "setLevel": noop
            }

try {
  exports.log4js = require('log4js');
} catch(e) {
  exports.log4js = function() {
    return { 'getLogger': function() { return noops }
           }
  }
}


//
// A simple run-once tool
//

exports.Once = Once;
function Once () {
  var self = this;

  self.task    = null;
  self.is_done = false;
  self.pending = null;
  self.result  = undefined;
}

Once.prototype.on_done = function(callback) {
  var self = this;

  if(self.is_done)
    return callback.apply(null, self.result);

  self.pending = self.pending || new events.EventEmitter;
  self.pending.setMaxListeners(30);
  self.pending.on('done', callback);
}

Once.prototype.job = function(task) {
  var self = this;

  // Only the first .job() call does anything.
  if(self.task)
    return;

  self.task = task;
  self.pending = self.pending || new events.EventEmitter;
  self.pending.setMaxListeners(30);

  task(on_done);
  function on_done() {
    self.is_done = true;
    self.result = Array.prototype.slice.call(arguments);
    self.pending.emit.apply(self.pending, ['done'].concat(self.result));
  }
}
