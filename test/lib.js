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
  lib.req_json({method:'PUT', uri:COUCH+'/'+DB}, function(er, resp, body) {
    if(er && er.statusCode != 412)
      throw er;
    done()
  })
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
},

{'timeout': 10 * 1000}, // req_json should time out in 5 seconds.
function req_json_times_out(done) {
  var begin, end, duration;
  var changes = COUCH + '/' + DB + '/_changes?feed=continuous';

  begin = new Date;
  lib.req_json(changes, function(er, resp, body) {
    end = new Date;
    duration = end - begin;

    assert.ok(er, 'req_json should error out after a timeout')
    assert.ok(er.timeout, 'req_json should time out on no response')
    assert.almost(duration, 5000, 'req_json should time out at 5 seconds by default')
    assert.almost(er.timeout, 5000, 'req_json should indicate the duration in the error object')

    begin = new Date;
    lib.req_json({uri:changes, timeout:150}, function(er, resp, body) {
      end = new Date;
      duration = end - begin;

      assert.ok(er, 'req_json should error out after a given timeout')
      assert.ok(er.timeout, 'req_json should honor a given timeout on no response')
      assert.almost(duration, 150, 'req_json should time out at the given timespan')
      assert.almost(er.timeout, 150, 'req_json should indicate the given duration in the error object')

      var short_lib = lib.defaults({'request_timeout':250});

      begin = new Date;
      short_lib.req_json(changes, function(er, resp, body) {
        end = new Date;
        duration = end - begin;

        assert.ok(er, 'req_json should error out after a defaulted timeout')
        assert.ok(er.timeout, 'req_json should honor default timeout on no response')
        assert.almost(duration, 250, 'req_json should time out at the default timespan')
        assert.almost(er.timeout, 250, 'req_json should indicate the default duration in the error object')

        done()
      })
    })
  })
},

] // TESTS
