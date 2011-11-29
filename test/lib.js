// library tests
//

var util = require('util'), I = util.inspect
  , assert = require('assert')

var lib = require('../lib')
  , COUCH = process.env.cqs_couch || 'http://localhost:5984'
  , DB    = process.env.cqs_db    || 'cqs_test'


var state = {};
module.exports = [ // TESTS

function setup(done) {
  // Nothing to do
  done()
},

// =-=-=-=-=-=-=-=-=

function req_json(done) {
  lib.req_json({uri:COUCH}, function(er, resp, hello) {
    if(er) throw er;

    assert.ok(hello, 'CouchDB response')
    assert.equal('Welcome', hello.couchdb, 'Correct CouchDB hello response')
    done()
  })
},

function req_json_string_argument(done) {
  assert.equal(typeof COUCH, 'string', 'COUCH is a string URI')

  lib.req_json(COUCH, function(er, resp, hello) {
    if(er) throw er;

    assert.ok(hello, 'CouchDB response from string')
    assert.equal('Welcome', hello.couchdb, 'CouchDB hello response from string URI')
    done();
  })
}

//{'timeout_coefficient':5},

] // TESTS
