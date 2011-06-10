#!/usr/bin/env node
//
// Run the tests

var util = require('util'), I = util.inspect
  , assert = require('assert')
  , request = require('request')
  ;

var XX_MEANS_EXCLUDE = process.env.xx ? false : true; // Set to false to run *only* the xx tests.
var TESTS = require('./all');

//
// Runner
//

var errors = [];
var count = { pass: 0
            , timeout: 0
            , fail: 0
            , skip: 0
            , inc: function(type) {
                     this[type] += 1
                     var symbol = type[0].toUpperCase().replace(/P/, '.');
                     process.stdout.write(symbol);
                     return run();
                   }
            }

function run() {
  var test = TESTS.shift();
  if(!test)
    return complete();

  var starts_with_xx = /^xx/.test(test.name);
  if( XX_MEANS_EXCLUDE ? starts_with_xx : !starts_with_xx )
    return count.inc('skip');

  function done(er) {
    if(er === 'timeout') {
      errors.push(new Error('Timeout: ' + test.name));
      return count.inc('timeout');
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

  // This is pretty convenient. Simply throw an error and we'll assume it pertains to this unit test.
  process.removeAllListeners('uncaughtException');
  process.on('uncaughtException', function(er) { return done(er); })

  test(done);
}

function complete() {
  process.stdout.write('\n\n');
  errors.forEach(function(er) {
    var stack = er.stack;
    if(er.expected || er.actual)
      stack = "expected=" + util.inspect(er.expected) + ' actual=' + util.inspect(er.actual) + '\n' + stack;

    console.error(stack);
  })

  console.log('Done: pass:' + count.pass + ' fail:' + count.fail + ' timeout:' + count.timeout + ' skip:' + count.skip);
}

run();

//
// Utilities
//

if(! assert.member)
  assert.member = function(elem, list, message) {
    var is_member = false;
    list.forEach(function(list_elem) {
      if(list_elem === elem)
        is_member = true;
    })

    if(!is_member)
      throw new Error(message || "");
  }

if(! assert.any)
  assert.any = function(list, message, pred) {
    for(var a = 0; a < list.length; a++)
      if(pred.call(null, list[a]))
        return true;
    throw new Error(message || "assert.any");
  }

if(! assert.none)
  assert.none = function(list, message, pred) {
    for(var a = 0; a < list.length; a++)
      if(pred.call(null, list[a]))
        throw new Error(message || "assert.none");
    return true;
  }
