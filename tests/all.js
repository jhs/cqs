#!/usr/bin/env node
// The changes_couchdb command-line interface.
//

var cqs = require('../api')
  , assert = require('assert')
  ;

var COUCH = 'http://localhost:5984';
var DB    = COUCH + '/cqs_test';

var TESTS = [

function create_queue(done) {
  done();
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
                     process.stdout.write(type === 'pass' ? '.' : 'E');
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

  try        { test(done); }
  catch (er) { done(er)    }
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
