// Tests for lib.Once
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

var lib = require('../../lib')
  , Once = lib.Once


test('Once API', function(t) {
  var o = new Once;

  o.on_done(handler)
  function handler(a, b, c) {
    t.equal(a, 'Apple', 'First result passed back to Once on_done')
    t.equal(b, 'Bone' , 'Second result passed back to Once on_done')
    t.equal(c, 'CouchDB', 'Third result passed back to Once on_done')
    t.end()
  }

  o.job(function(callback) {
    callback('Apple', 'Bone', 'CouchDB');
  })
})

test('Once API delayed', function(t) {
  var o = new Once;

  o.job(function(callback) {
    setTimeout(function() { callback('foo', 'bar', 'baz') }, 100);
  })

  o.on_done(function(foo, bar, baz) {
    t.equal(foo, 'foo', 'First result passed back to Once on_done')
    t.equal(bar, 'bar' , 'Second result passed back to Once on_done')
    t.equal(baz, 'baz', 'Third result passed back to Once on_done')
    t.end()
  })
})

//{'timeout_coefficient':5},
test('Many waiters', function(t) {
  var o = new Once
    , waiters = 5000
    , delay = 200

  var found = {};
  for(var a = 0; a < waiters; a++)
    o.on_done(waiter(a));

  o.on_done(function() {
    setTimeout(function() {
      for(var a = 0; a < waiters; a++)
        t.ok(found[a], 'Waiter number ' + a + ' fired')
      t.end();
    }, 500)
  })

  o.job(function(callback) {
    setTimeout(function() { callback('ok') }, delay);
  })

  function waiter(label) {
    return function(result) {
      t.equal(result, 'ok', 'Got the correct result')
      //console.error(label + ' hit');
      found[label] = true;
    }
  }
})
