// Library tests
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

var tap = require('./tap')
var test = tap.test
var util = require('util')

var lib = require('../../lib')
  , COUCH = process.env.cqs_couch || 'http://localhost:5984'
  , DB    = process.env.cqs_db    || 'cqs_test'


test('Library setup', function(t) {
  lib.req_json({method:'PUT', uri:COUCH+'/'+DB}, function(er, resp, body) {
    if(er && er.statusCode != 412)
      throw er;
    t.ok(er.statusCode == 201 || er.statusCode == 412, 'Create test DB')
    t.end()
  })
})

test('req_json', function(t) {
  lib.req_json({uri:COUCH}, function(er, resp, hello) {
    if(er) throw er;

    t.ok(hello, 'CouchDB response')
    t.equal('Welcome', hello.couchdb, 'Correct CouchDB hello response')
    t.end()
  })
})

test('req_json string argument', function(t) {
  t.equal(typeof COUCH, 'string', 'COUCH is a string URI')

  lib.req_json(COUCH, function(er, resp, hello) {
    if(er) throw er;

    t.ok(hello, 'CouchDB response from string')
    t.equal('Welcome', hello.couchdb, 'CouchDB hello response from string URI')
    t.end()
  })
})

//{'timeout': 10 * 1000}, // req_json should time out in 5 seconds.
test('req_json times out', function(t) {
  var begin, end, duration;
  var changes = COUCH + '/' + DB + '/_changes?feed=continuous';

  begin = new Date;
  lib.req_json(changes, function(er, resp, body) {
    end = new Date;
    duration = end - begin;

    t.ok(er, 'req_json should error out after a timeout')
    t.ok(er.timeout, 'req_json should time out on no response')
    t.almost(duration, 5000, 'req_json should time out at 5 seconds by default')
    t.almost(er.timeout, 5000, 'req_json should indicate the duration in the error object')
    return t.end()

    begin = new Date;
    lib.req_json({uri:changes, timeout:150}, function(er, resp, body) {
      end = new Date;
      duration = end - begin;

      t.ok(er, 'req_json should error out after a given timeout')
      t.ok(er.timeout, 'req_json should honor a given timeout on no response')
      t.almost(duration, 150, 'req_json should time out at the given timespan')
      t.almost(er.timeout, 150, 'req_json should indicate the given duration in the error object')

      var short_lib = lib.defaults({'request_timeout':250});

      begin = new Date;
      short_lib.req_json(changes, function(er, resp, body) {
        end = new Date;
        duration = end - begin;

        t.ok(er, 'req_json should error out after a defaulted timeout')
        t.ok(er.timeout, 'req_json should honor default timeout on no response')
        t.almost(duration, 250, 'req_json should time out at the default timespan')
        t.almost(er.timeout, 250, 'req_json should indicate the default duration in the error object')

        t.end()
      })
    })
  })
})
