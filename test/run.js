#!/usr/bin/env node
//
// Run the tests

var lib = require('../lib')
  , util = require('util'), I = util.inspect
  , assert = require('assert')
  , request = require('request')
  ;

var XX_MEANS_EXCLUDE = process.env.xx ? false : true; // Set to false to run *only* the xx tests.
var DEFAULT_TEST_TIMEOUT = 250; // ms
var BROWSER_TIMEOUT_COEFFICIENT = 2.50;

var TESTS = require('./all');

// No idea what's going on but in IE, there is an undefined element at the end of the list.
while(! TESTS[TESTS.length - 1])
  TESTS.length = TESTS.length - 1;

var LOG = lib.log4js().getLogger('tests');
LOG.setLevel(lib.LOG_LEVEL);

//
// Runner
//

var errors = [];
var count = { pass: 0
            , timeout: 0
            , fail: 0
            , skip: 0
            }

count.inc = function(type) {
  this[type] += 1
  var symbol = type[0].toUpperCase().replace(/P/, '.');
  process.stdout.write(symbol);

  if(type === 'fail' || type === 'timeout' && process.env.exit)
    TESTS = [];
  return run();
}

var decoration = {};
TESTS = TESTS.reduce(function(so_far, obj) {
  if(typeof obj === 'function') {
    so_far.push(obj);
    lib.copy(decoration, obj);
    decoration = {};
  } else {
    lib.copy(obj, decoration);
  }
  return so_far;
}, []);

function run() {
  var test = TESTS.shift();
  if(!test)
    return complete();

  var starts_with_xx = /^xx/.test(test.name);
  if(test.name !== 'setup') {
    if( XX_MEANS_EXCLUDE ? starts_with_xx : !starts_with_xx )
      return count.inc('skip');
  }

  var timeout = test.timeout || DEFAULT_TEST_TIMEOUT;
  timeout *= (test.timeout_coefficient || 1);
  if(require.isBrowser)
    timeout *= BROWSER_TIMEOUT_COEFFICIENT;

  var start_at = new Date;
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

    var end_at = new Date;
    var duration = end_at - start_at;
    if(duration > (timeout * 0.80))
      LOG.warn('Long processing time: ' + test.name + ' took ' + duration + 'ms');

    return count.inc('pass');
  }

  test.timer = setTimeout(function() { done('timeout') }, timeout);

  // This is pretty convenient. Simply throw an error and we'll assume it pertains to this unit test.
  process.removeAllListeners('uncaughtException');
  process.on('uncaughtException', function(er) { return done(er); })

  LOG.debug('Test: ' + test.name);
  try       { test(done) }
  catch(er) { done(er)   }
}

function complete() {
  process.stdout.write('\n\n');
  errors.forEach(function(er) {
    var stack = er.stack;
    if(er.expected || er.actual)
      stack = "expected=" + util.inspect(er.expected) + ' actual=' + util.inspect(er.actual) + '\n' + stack;

    LOG.error(stack);
  })

  LOG.info('Pass   : ' + count.pass);
  LOG.info('Fail   : ' + count.fail);
  LOG.info('Timeout: ' + count.timeout);
  LOG.info('Skip   : ' + count.skip);
}

exports.run = function(timeout_coefficient) {
  if(timeout_coefficient)
    BROWSER_TIMEOUT_COEFFICIENT = timeout_coefficient;

  run();
}

if(require.main === module)
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

if(! assert.func)
  assert.func = function(obj, message) {
    if(typeof obj !== 'function')
      throw new Error(message || "assert.func");
  }

if(! assert.almost)
  assert.almost = function(actual, expected, message) {
    var delta = Math.abs(actual - expected);
    var margin = delta / expected;
    if(margin > 0.10)
      throw new Error(message || "assert.almost");
  }
