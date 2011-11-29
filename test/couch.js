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

function uuids(done) {
  var db = new cqs.Db;
  var couch = db.couch;

  couch.uuid(function(er, uuid) {
    if(er) throw er;
    assert.ok(uuid, 'uuid() returns a uuid')
    assert.equal(typeof uuid, 'string', 'Simple uuid() call returns a uuid')
    assert.equal(uuid.length, 32, 'uuid is 256-bits (32 bytes)')

    couch.uuid(5, function(er, uuids) {
      if(er) throw er;

      assert.ok(uuids, 'uuid(N) returns uuids')
      assert.ok(Array.isArray(uuids), 'uuid(N) returns a list of uuids')
      assert.equal(uuids.length, 5, 'uuid(N) returns N uuids')
      uuids.forEach(function(uuid, a) {
        assert.equal(typeof uuid, 'string', 'UUID #'+ (a+1) + ' is a string')
        assert.equal(uuid.length, 32, 'UUID #'+ (a+1) +' 256-bits (32 bytes)')
      })

      done()
    })
  })
},

{'timeout_coefficient':10},
function lots_of_uuids(done) {
  var db = new cqs.Db;
  var couch = db.couch;

  couch.uuid(12345, function(er, uuids) {
    if(er) throw er;

    assert.equal(uuids.length, 12345, 'Multiple batches of uuids works')
    done()
  })
},

{'timeout_coefficient':10},
function lots_of_individual_uuids(done) {
  var db = new cqs.Db;
  var couch = db.couch;

  var found = 0;
  for(a = 0; a < 12345; a++)
    couch.uuid(function(er, uuid) {
      if(er) throw er;

      assert.equal(typeof uuid, 'string', 'A single UUID out of many');
      found += 1;
      if(found == 12345)
        done();
    })
},

] // TESTS
