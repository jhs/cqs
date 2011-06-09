// Couch database
//
// I know maintenance will eventually have to be performed, like purging old documents.
// This is a place where it can go. Maybe in the future you can have dedicated maintenance
// nodes that don't interfere with the main API.
//
// Also, hopefully this file can be ported to browser Javascript and the same code can
// run client-side.

var lib = require('./lib')
  , util = require('util')
  , assert = require('assert')
  , request = require('request')
  , querystring = require('querystring')
  ;

//
// Constants
//

var KNOWN_COUCHES = {};

//
// API
//

function Couch () {
  this.url     = null;
  this.userCtx = null;

  this.known_dbs = {};
}


function Database (opts) {
  var self = this;

  if(typeof opts.couch !== 'string')
    throw new Error('Required "couch" option with URL of CouchDB');

  if(typeof opts.db !== 'string')
    throw new Error('Required "db" option with db name for queues');

  self.couch_url = opts.couch;
  self.name      = opts.db;

  self.couch  = null;
  self.db     = null;

  self.log = lib.log4js().getLogger('Queue/' + self.name);
  self.log.setLevel(process.env.cqs_log_level || "info");
}


Database.prototype.request = function(opts, callback) {
  var self = this;

  if(typeof opts === 'string')
    opts = {'uri':opts};

  self.with_db(function(er) {
    if(er) return callback(er);

    opts.uri = self.couch.url + '/' + self.name + '/' + opts.uri;
    return req_json(opts, callback);
  })
}


Database.prototype.with_couch = function(cb) {
  var self = this;

  if(self.couch)
    return cb && cb();

  var known_couch = KNOWN_COUCHES[self.couch_url];
  if(known_couch) {
    self.couch = known_couch;
    return cb && cb();
  }

  self.log.debug('Confirming Couch: ' + self.couch_url);
  req_json(self.couch_url, function(er, resp, body) {
    if(er) return cb && cb(er);

    if(body.couchdb !== 'Welcome')
      return cb && cb(new Error('Bad CouchDB response from ' + self.couch_url));

    var session_url = self.couch_url + '/_session';
    self.log.debug('Confirming session: ' + session_url);

    req_json(session_url, function(er, resp, session) {
      if(er) return cb && cb(er);

      if(!session.userCtx)
        return cb && cb(new Error('Bad CouchDB response from ' + session_url));

      self.log.debug('Couch confirmed: ' + self.couch_url);
      self.log.debug('User context: ' + lib.JS(session.userCtx));

      self.couch = new Couch;
      self.couch.url = self.couch_url;
      self.couch.userCtx = session.userCtx;
      KNOWN_COUCHES[self.couch_url] = self.couch;

      return cb();
    })
  })
}

Database.prototype.with_db = function(cb) {
  var self = this;

  self.with_couch(function() {
    if(self.db)
      return cb && cb();

    var known_db = self.couch.known_dbs[self.name];
    if(known_db) {
      self.db = known_db;
      return cb && cb();
    }

    var db_url = self.couch.url + '/' + self.name;

    self.log.debug('Confirming DB: ' + db_url);
    req_json(db_url, function(er, resp, db) {
      if(er) return cb && cb(er);

      if(db.db_name !== self.name)
        return cb && cb(new Error('Expected DB name "'+self.name+'": ' + db.db_name));

      self.log.debug('Database confirmed: ' + db_url);

      self.couch.known_dbs[self.name] = db;
      self.db                         = db;

      return cb();
    })
  })
}

module.exports = { "Database" : Database
                 };


//
// Utilities
//

function req_json(opts, callback) {
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
