#!/usr/bin/env node
// The changes_couchdb command-line interface.
//

var COUCH = 'http://localhost:5984';
//COUCH = 'http://jhs-mac.local:15984';
var DB    = 'cqs_test';

var cqs = require('../api').defaults({'couch':COUCH, 'db':DB})
  , util = require('util'), I = util.inspect
  , assert = require('assert')
  , request = require('request')
  ;

var XX_MEANS_EXCLUDE = process.env.xx ? false : true; // Set to false to run *only* the xx tests.

var state = {};
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
  cqs.CreateQueue('foo', function(er, queue) {
    if(er) return done(er);
    assert.equal(queue.name, 'foo', "CreateQueue returns the queue name");
    state.foo = queue;
    done();
  })
},

function create_queue_with_obj(done) {
  cqs.CreateQueue({name:'bar', DefaultVisibilityTimeout:111}, function(er, queue) {
    if(er) return done(er);
    assert.equal(queue.name, 'bar', "CreateQueue returns the queue name");
    state.bar = queue;
    done();
  })
},

function instantiate_queue_loads_from_couch(done) {
  var should_be_bar = new cqs.Queue('bar');
  should_be_bar.confirm(function(er) {
    if(er) throw er;
    assert.equal(should_be_bar.DefaultVisibilityTimeout, 111, "Should get bar's visibility timeout");
    assert.equal(should_be_bar.DefaultVisibilityTimeout, state.bar.DefaultVisibilityTimeout, "Should get bar's visibility timeout");
    done();
  })
},

function list_queues(done) {
  cqs.ListQueues(function(er, queues) {
    if(er) throw er;
    assert.equal(2, queues.length);

    assert.any(queues, "Queue list should include foo", function(q) { return q.name == 'foo' });
    assert.any(queues, "Queue list should include bar", function(q) { return q.name == 'bar' });
    done();
  })
},

function list_queues_with_prefix(done) {
  cqs.ListQueues('f', function(er, queues) {
    if(er) throw er;
    assert.equal(1, queues.length);

    function is_foo(q) { return q.name == 'foo' }
    function is_bar(q) { return q.name == 'bar' }

    assert.none(queues, "Queues should not have bar", is_bar);
    assert.any(queues , "Queues should have foo"    , is_foo);

    cqs.ListQueues('b', function(er, queues) {
      if(er) throw er;
      assert.equal(1, queues.length);
      assert.none(queues, "Queues should not have foo", is_foo);
      assert.any(queues , "Queues should have bar"    , is_bar);
      done();
    })
  })
},

function send_message(done) {
  state.foo.SendMessage('Message one', function(er, msg) {
    if(er) throw er;

    // TODO: confirm MD5.

    ; ["MD5OfMessageBody", "MessageId"].forEach(function(key) {
      assert.ok(key in msg, "SendMessage result needs key: " + key);
    })

    done();
  })
},

]; // TESTS

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
