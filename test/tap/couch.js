// The changes_couchdb command-line interface.
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
  , test = tap.test
var util = require('util')

var COUCH = process.env.cqs_couch || 'http://localhost:5984';
var DB    = process.env.cqs_db    || 'cqs_test';

if(process.env.charles)
  COUCH = 'http://jhs-mac.local:15984';
  //COUCH = 'http://192.168.3.10:15984';

var time_C = parseFloat("" + (process.env.timeout_coefficient || process.env.C || 1.0));
var cqs = require('../../api').defaults({ 'couch' : COUCH
                                        , 'db'    : DB
                                        , 'time_C': time_C
                                        , 'browser_attachments': false
                                        })


test('API', function(t) {
  var db = new cqs.Db;
  t.ok(db, 'Database object API')
  t.ok(db.couch, 'Database has a .couch object')

  t.type(db.changes, 'function', 'Database has a .changes() method')
  var feed = db.changes()
  t.type(feed.start, 'function', 'Feed object looks good')
  t.equal(feed.db, COUCH+'/'+DB, 'Feed object has the correct DB set')

  t.end()
})

test('UUIDs', function(t) {
  var db = new cqs.Db;
  var couch = db.couch;

  couch.uuid(function(er, uuid) {
    if(er) throw er;
    t.ok(uuid, 'uuid() returns a uuid')
    t.equal(typeof uuid, 'string', 'Simple uuid() call returns a uuid')
    t.equal(uuid.length, 32, 'uuid is 256-bits (32 bytes)')

    couch.uuid(5, function(er, uuids) {
      if(er) throw er;

      t.ok(uuids, 'uuid(N) returns uuids')
      t.ok(Array.isArray(uuids), 'uuid(N) returns a list of uuids')
      t.equal(uuids.length, 5, 'uuid(N) returns N uuids')
      uuids.forEach(function(uuid, a) {
        t.equal(typeof uuid, 'string', 'UUID #'+ (a+1) + ' is a string')
        t.equal(uuid.length, 32, 'UUID #'+ (a+1) +' 256-bits (32 bytes)')
      })

      t.end()
    })
  })
})

//{'timeout_coefficient':10},
test('Lots of UUIDs', function(t) {
  var db = new cqs.Db;
  var couch = db.couch;

  couch.uuid(12345, function(er, uuids) {
    if(er) throw er;
    t.equal(uuids.length, 12345, 'Multiple batches of uuids works')
    t.end()
  })
})

//{'timeout_coefficient':10},
test('Lots of individual UUIDs', function(t) {
  var db = new cqs.Db;
  var couch = db.couch;

  var found = 0;
  for(a = 0; a < 12345; a++)
    couch.uuid(function(er, uuid) {
      if(er) throw er;

      t.equal(typeof uuid, 'string', 'A single UUID out of many');
      found += 1;
      if(found == 12345)
        return t.end()
    })
})
