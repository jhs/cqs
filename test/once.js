// The changes_couchdb command-line interface.
//

var util = require('util'), I = util.inspect
  , assert = require('assert')

var lib = require('../lib')
  , Once = lib.Once


var state = {};
module.exports = [ // TESTS

function setup(done) {
  // Nothing to do
  done()
},

// =-=-=-=-=-=-=-=-=

function once_api(done) {
  var o = new Once;

  o.on_done(handler)
  function handler(a, b, c) {
    assert.equal(a, 'Apple', 'First result passed back to Once on_done')
    assert.equal(b, 'Bone' , 'Second result passed back to Once on_done')
    assert.equal(c, 'CouchDB', 'Third result passed back to Once on_done')
    done()
  }

  o.job(function(callback) {
    callback('Apple', 'Bone', 'CouchDB');
  })
},

function once_api_delayed(done) {
  var o = new Once;

  o.job(function(callback) {
    setTimeout(function() { callback('foo', 'bar', 'baz') }, 100);
  })

  o.on_done(function(foo, bar, baz) {
    assert.equal(foo, 'foo', 'First result passed back to Once on_done')
    assert.equal(bar, 'bar' , 'Second result passed back to Once on_done')
    assert.equal(baz, 'baz', 'Third result passed back to Once on_done')
    done()
  })
},

{'timeout_coefficient':5},
function many_waiters(done) {
  var o = new Once
    , waiters = 5000
    , delay = 200

  var found = {};
  for(var a = 0; a < waiters; a++)
    o.on_done(waiter(a));

  o.on_done(function() {
    setTimeout(function() {
      for(var a = 0; a < waiters; a++)
        assert.ok(found[a], 'Waiter number ' + a + ' fired')
      done();
    }, 500)
  })

  o.job(function(callback) {
    setTimeout(function() { callback('ok') }, delay);
  })

  function waiter(label) {
    return function(result) {
      assert.equal(result, 'ok', 'Got the correct result')
      //console.error(label + ' hit');
      found[label] = true;
    }
  }
},

] // TESTS
