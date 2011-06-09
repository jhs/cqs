#!/usr/bin/env node
// The changes_couchdb command-line interface.
//

var COUCH = 'http://localhost:5984';
var DB    = 'cqs_test';

var cqs = require('../api').defaults({'couch':COUCH, 'db':DB})
  , assert = require('assert')
  ;

var TESTS = [

function create_queue(done) {
  cqs.CreateQueue('foo', function(er, res) {
    if(er) return done(er);
    assert.equal(res, 'foo', "CreateQueue returns the queue name");
    done();
  })
},

function create_queue_with_obj(done) {
  cqs.CreateQueue({name:'bar'}, function(er, res) {
    if(er) return done(er);
    assert.equal(res, 'bar', "CreateQueue returns the queue name");
    done();
  })
},

]; // TESTS

//
// Runner
//

var errors = [];
var count = { pass: 0
            , fail: 0
            , inc: function(type) {
                     this[type] += 1
                     process.stdout.write(type === 'pass' ? '.' : 'F');
                     return run();
                   }
            }

function run() {
  var test = TESTS.shift();
  if(!test)
    return complete();

  function done(er) {
    if(er === 'timeout') {
      errors.push(new Error('Timeout: ' + test.name));
      return count.inc('fail');
    }

    clearTimeout(test.timer);
    if(er) {
      errors.push(er);
      return count.inc('fail');
    }

    return count.inc('pass');
  }

  var timeout = 250;
  test.timer = setTimeout(function() { done('timeout') }, timeout);

  process.removeAllListeners('uncaughtException');
  process.on('uncaughtException', function(er) { return done(er); })
  test(done);
}

function complete() {
  process.stdout.write('\n\n');
  errors.forEach(function(er) {
    console.error(er.stack);
  })

  console.log('Done: pass:' + count.pass + ' fail:' + count.fail);
}

run();

//
// Utilities
//
