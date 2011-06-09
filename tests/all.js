#!/usr/bin/env node
// The changes_couchdb command-line interface.
//

var COUCH = 'http://localhost:5984';
var DB    = 'cqs_test';

var cqs = require('../api').defaults({'couch':COUCH, 'db':DB})
  , util = require('util')
  , assert = require('assert')
  , request = require('request')
  ;

var TESTS = [

function setup(done) {
  var url = COUCH + '/' + DB;
  request({method:'DELETE', uri:url}, function(er, resp, body) {
    if(er) throw er;
    var json = JSON.parse(body);

    var already_gone = (resp.statusCode === 404 && json.error === 'not_found');
    var deleted      = (resp.statusCode === 200 && json.ok    === true);

    if(! (already_gone || deleted))
      throw new Error('Unknown DELETE response: ' + resp.statusCode + ' ' + body);

    request({method:'PUT', uri:url}, function(er, resp, body) {
      if(er) throw er;
      var json = JSON.parse(body);

      if(resp.statusCode !== 201 || json.ok !== true)
        throw new Error('Unknown PUT response: ' + resp.statusCode + ' ' + body);

      done();
    })
  })
},

//
// TESTS
//

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

function list_queues(done) {
  cqs.ListQueues(function(er, res) {
    if(er) throw er;
    assert.equal(2, res.length);
    assert.ok(res.indexOf('foo') !== -1);
    assert.ok(res.indexOf('bar') !== -1);
    done();
  })
},

function list_queues_with_prefix(done) {
  cqs.ListQueues('f', function(er, res) {
    if(er) throw er;
    assert.equal(1, res.length);
    assert.ok(res.indexOf('foo') !== -1);
    assert.ok(res.indexOf('bar') === -1);

    cqs.ListQueues('b', function(er, res) {
      if(er) throw er;
      assert.equal(1, res.length);
      assert.ok(res.indexOf('foo') === -1);
      assert.ok(res.indexOf('bar') !== -1);
      done();
    })
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
    var stack = er.stack;
    if(er.expected || er.actual)
      stack = "expected=" + util.inspect(er.expected) + ' actual=' + util.inspect(er.actual) + '\n' + stack;

    console.error(stack);
  })

  console.log('Done: pass:' + count.pass + ' fail:' + count.fail);
}

run();

//
// Utilities
//
