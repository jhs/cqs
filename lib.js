// Utility library
//

var request = require('request')
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

  opts.headers = opts.headers || {};
  opts.headers['accept']       = 'application/json';
  opts.headers['content-type'] = 'application/json';

  return request(opts, function(er, resp, body) {
    if(er) return callback(er);

    if(resp.statusCode < 200 || resp.statusCode >= 300)
      return callback(new Error('Couch response ' + resp.statusCode + ' to ' + opts.uri + ': ' + body));

    var obj;
    try        { obj = JSON.parse(body) }
    catch (js_er) { return callback(js_er) }

    return callback(null, resp, obj);
  })
}

exports.enc_id = function encode_doc_id(id) {
  return encodeURIComponent(id).replace(/^_design%2[fF]/, '_design/');
}

// Wrap log4js so it will not be a dependency.
var VERBOSE = !!process.env.verbose;

var noop = function() {};
var noops = { "trace": noop
            , "debug": VERBOSE ? console.log   : noop
            , "info" : VERBOSE ? console.info  : noop
            , "warn" : VERBOSE ? console.warn  : noop
            , "error": VERBOSE ? console.error : noop
            , "fatal": VERBOSE ? console.error : noop

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
