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

var state = {};
module.exports = [ // TESTS

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

// =-=-=-=-=-=-=-=-=

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
  state.bar.SendMessage('Message one', function(er, msg) {
    if(er) throw er;

    // TODO: confirm MD5.

    ; ["Body", "MD5OfMessageBody", "MessageId"].forEach(function(key) {
      assert.ok(key in msg, "SendMessage result needs key: " + key);
    })

    assert.equal(msg.Body, 'Message one', "Message body should be what was sent");

    state.message_one = msg;
    done();
  })
},

function receive_no_message(done) {
  state.foo.ReceiveMessage(function(er, messages) {
    if(er) throw er;

    assert.equal(messages.length, 0, 'Foo queue should not have any messages yet');
    done();
  })
},

function receive_message(done) {
  state.bar.ReceiveMessage(function(er, messages) {
    if(er) throw er;

    assert.equal(messages.length, 1, 'Bar queue should have message from earlier');
    var msg = messages[0];
    assert.equal(msg.Body, state.message_one.Body, "Message should be message one's body");
    assert.equal(msg.Body, 'Message one'         , "Message should be message one's body");

    done();
  })
},

] // TESTS
