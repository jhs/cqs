// The changes_couchdb command-line interface.
//

var COUCH = process.env.cqs_couch || 'http://localhost:5984';
var DB    = process.env.cqs_db    || 'cqs_test';

if(process.env.charles)
  COUCH = 'http://jhs-mac.local:15984';
  //COUCH = 'http://192.168.3.10:15984';

if(require.isBrowser) {
  COUCH = window.location.protocol + '//' + window.location.host;
  DB    = 'cqs_browser_test';
}

var time_C = parseFloat("" + (process.env.timeout_coefficient || process.env.C || 1.0));
var cqs = require('../api').defaults({ 'couch' : COUCH
                                     , 'db'    : DB
                                     , 'time_C': time_C
                                     , browser_attachments: !(process.env.skip_browser)
                                     })
  , util = require('util'), I = util.inspect
  , assert = require('assert')
  , request = require('request')
  ;

var state = {};
module.exports = [ // TESTS

function setup(done) {
  done() // Nothing to do
},

// =-=-=-=-=-=-=-=-=

function api(done) {
  var db = new cqs.Db;
  assert.ok(db, 'Database object API')
  assert.ok(db.couch, 'Database has a .couch object')
  done()
},

] // TESTS
