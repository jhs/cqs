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

require('defaultable')(module,
  { 'request_timeout': 5000
  , 'strictSSL'      : true
  }, function(module, exports, DEFS, require) {

var request = require('request').defaults({'strictSSL': DEFS.strictSSL})
  , events = require('events')

// A workaround since defaultable seems to be breaking `instanceof` since it re-evaluates modules a lot.
exports.instanceof = function instance0f(obj, type) {
  if(typeof type != 'function' || typeof obj != 'object')
    return false;
  return !!(obj && obj.constructor && obj.constructor.name === type.name);
}

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

  // Force Request to return a deserialized object.
  opts.json = opts.json || true;

  var started_at = new Date;
  var timer_ms = (opts.timeout || DEFS.request_timeout) * (opts.time_C || 1.0);
  delete opts.time_C;

  var in_flight = request(opts, on_req_done) // Go!

  //console.log('Request timeout will be: ' + timer_ms);
  var timed_out = false, timer = setTimeout(on_timeout, timer_ms);
  function on_timeout() {
    timed_out = true;
    var duration = (new Date) - started_at;
    var timeout_er = new Error('Request timeout (' + (duration/1000).toFixed(1) + 's): ' + opts.uri);
    timeout_er.timeout = duration;

    //if(in_flight && in_flight.response && in_flight.response.abort)
    //  in_flight.response.abort()
    //if(in_flight && in_flight.response.connection)
    //  in_flight.response.connection.destroy()
    if(in_flight && in_flight.req && in_flight.req.connection && in_flight.req.connection.destroy)
      in_flight.req.connection.destroy()
    if(in_flight && in_flight.destroy)
      in_flight.destroy()

    callback(timeout_er);
  }

  return in_flight

  function on_req_done(er, resp, body) {
    clearTimeout(timer);
    if(timed_out)
      return;
    if(er)
      return callback(er);

    if(resp.statusCode < 200 || resp.statusCode >= 300)
      if(! couch_errors_are_ok) {
        er = new Error('Couch response ' + resp.statusCode + ' to ' + opts.uri + ': ' + exports.JS(body));
        er.statusCode = resp.statusCode;
        for (var key in body)
          er[key] = body[key];
        return callback(er);
      }

    return callback(null, resp, body);
  }
}

exports.enc_id = function encode_doc_id(id) {
  return encodeURIComponent(id).replace(/^_design%2[fF]/, '_design/');
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
  self.listener_count = 0;
}

Once.prototype.on_done = function(callback) {
  var self = this;

  if(self.is_done)
    return callback.apply(null, self.result);

  self.pending = self.pending || new events.EventEmitter;

  self.listener_count += 1;
  self.pending.setMaxListeners(10 + self.listener_count);

  self.pending.on('done', callback);
}

Once.prototype.job = function(task) {
  var self = this;

  // Only the first .job() call does anything.
  if(self.task)
    return;

  self.task = task;
  self.pending = self.pending || new events.EventEmitter;

  task(on_done);
  function on_done() {
    self.is_done = true;
    self.result = Array.prototype.slice.call(arguments);
    self.pending.emit.apply(self.pending, ['done'].concat(self.result));
  }
}

}, require) // defaultable
