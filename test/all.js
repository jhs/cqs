// The changes_couchdb command-line interface.
//

var COUCH = process.env.cqs_couch || 'http://localhost:5984';
var DB    = process.env.cqs_db    || 'cqs_test';

if(process.env.charles)
  COUCH = 'http://jhs-mac.local:15984';
  //COUCH = 'http://192.168.3.10:15984';

if(require.isBrowser) {
  COUCH = window.location.protocol + '//' + window.location.host;
  DB    = 'cqs_browser_test';
}

var time_C = parseFloat("" + (process.env.timeout_coefficient || process.env.C || 1.0));
var cqs = require('../api').defaults({ 'couch' : COUCH
                                     , 'db'    : DB
                                     , 'time_C': time_C
                                     , browser_attachments: !(process.env.skip_browser)
                                     })
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
    state.log = state.foo.log;
    done();
  })
},

function create_queue_with_obj(done) {
  cqs.CreateQueue({name:'bar', DefaultVisibilityTimeout:111}, function(er, queue) {
    if(er) return done(er);
    assert.equal(queue.name, 'bar', "CreateQueue returns the queue name");
    assert.equal(queue.VisibilityTimeout, 111, "Created with visibility 111");
    state.bar = queue;
    done();
  })
},

function instantiate_queue_loads_from_cache(done) {
  var should_be_bar = new cqs.Queue('bar');
  var start_at = new Date;
  should_be_bar.confirm(function(er) {
    if(er) throw er;
    var end_at = new Date;

    assert.equal(should_be_bar.VisibilityTimeout, 111, "Should get bar's visibility timeout");
    assert.equal(should_be_bar.VisibilityTimeout, state.bar.VisibilityTimeout, "Should get bar's visibility timeout");
    assert.ok(end_at - start_at < 20, "Bar should be known from cache within 50ms");
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
  state.bar.send({this_is:'Message one'}, function(er, msg) {
    if(er) throw er;

    // TODO: confirm MD5.

    ; ["Body", "MD5OfMessageBody", "MessageId"].forEach(function(key) {
      assert.ok(key in msg, "SendMessage result needs key: " + key);
    })

    assert.equal(msg.Body.this_is, 'Message one', "Message body should be what was sent");

    state.message_one = msg;
    done();
  })
},

function receive_no_message(done) {
  cqs.ReceiveMessage(state.foo, function(er, messages) {
    if(er) throw er;

    assert.equal(messages.length, 0, 'Foo queue should not have any messages yet');
    done();
  })
},

function receive_message(done) {
  state.bar.receive(function(er, messages) {
    if(er) throw er;

    assert.equal(messages.length, 1, 'Bar queue should have message from earlier');
    var msg = messages[0];
    assert.equal(msg.Body.this_is, state.message_one.Body.this_is, "Message should be message one's body");
    assert.equal(msg.Body.this_is, 'Message one'                 , "Message should be message one's body");

    // Deliberately leaving this message in the queue, to help expose errors,
    // such as incomplete timeouts.
    done();

    if(false) msg.del(function(er) {
      delete state.message_one;
      done(er);
    })
  })
},

function set_queue_attribs(done) {
  cqs.SetQueueAttributes(state.foo, {'VisibilityTimeout':1.5}, function(er) {
    if(er) throw er;

    assert.equal(state.foo.VisibilityTimeout, 1.5, "Foo should have 1.5 second visibility now");
    new cqs.Queue('foo').confirmed(function(er, foo2) {
      if(er) throw er;

      assert.equal(foo2.VisibilityTimeout, state.foo.VisibilityTimeout, "Both foos should be 1.5");
      assert.equal(foo2.VisibilityTimeout,                         1.5, "Both foos should be 1.5");

      done();
    })
  })
},

function make_sure_new_message_has_the_attributes(done) {
  cqs.SendMessage(state.foo, "Should be 1.5 visibility timeout", function(er) {
    if(er) throw er;
    var before = new Date;
    cqs.ReceiveMessage(state.foo, function(er, msg) {
      if(er) throw er;

      var now = new Date;
      var query_ms = now - before;
      msg = msg[0];

      var invisible_ms = (msg.visible_at - now) + (query_ms / 2);
      assert.ok(invisible_ms > 1000, "Not-visible time (should be 1500): " + invisible_ms);

      state.half_sec = msg;
      done();
    })
  })
},

{'timeout_coefficient': 10},
function delete_message(done) {
  var now = new Date;
  var vis_at = state.half_sec.visible_at;
  assert.ok(vis_at);
  assert.ok(vis_at - now > 0, "Too late to run this test: " + (vis_at - now));

  cqs.DeleteMessage(state.half_sec, function(er) {
    if(er) throw er;

    function check() {
      cqs.ReceiveMessage('foo', function(er, msg) {
        if(er) throw er;
        assert.equal(msg.length, 0, "Should be no more messages left: " + I(msg));
        done();
      })
    }

    var remaining = vis_at - (new Date);
    if(remaining < 0)
      check();
    else
      setTimeout(check, remaining * 1.10);
  })
},

{'timeout_coefficient': 2},
function send_message_api(done) {
  cqs.CreateQueue({name:'api_tests', DefaultVisibilityTimeout:60}, function(er, api_tests) {
    if(er) throw er;
    state.api_tests = api_tests;

    cqs.SendMessage(api_tests, 'API with string arg', function(er) {
      if(er) throw er;
      cqs.SendMessage(api_tests, 'API with queue arg', function(er) {
        if(er) throw er;
        api_tests.send({call_type: 'Method with object body'}, function(er) {
          if(er) throw er;
          api_tests.send('queue method call', function(er) {
            if(er) throw er;
            done();
          })
        })
      })
    })
  })
},

{'timeout_coefficient': 2},
function receive_message_api(done) {
  var messages = [];

  cqs.ReceiveMessage('api_tests', function(er, msg) {
    if(er) throw er;
    assert.equal(msg.length, 1, "Should receive 1 message");
    assert.equal(msg[0].Body, 'API with string arg', 'Messages should arrive in order');

    messages.push(msg[0]);
    cqs.ReceiveMessage(state.api_tests, 1, function(er, msg) {
      if(er) throw er;
      assert.equal(msg.length, 1, "Should receive 1 message");
      assert.equal(msg[0].Body, 'API with queue arg', 'Messages should arrive in order');

      messages.push(msg[0]);
      cqs.ReceiveMessage({queue:state.api_tests, 'MaxNumberOfMessages': 1}, function(er, msg) {
        if(er) throw er;
        assert.equal(msg.length, 1, "Should receive 1 message");
        assert.equal(msg[0].Body.call_type, 'Method with object body', 'Messages should arrive in order');

        messages.push(msg[0]);
        state.api_tests.receive(1, function(er, msg) {
          if(er) throw er;
          assert.equal(msg.length, 1, "Should receive 1 message");
          assert.equal(msg[0].Body, 'queue method call', 'Messages should arrive in order');

          messages.push(msg[0]);

          var deleted = 0;
          messages.forEach(function(msg) {
            msg.del(function() {
              deleted += 1;
              if(deleted == 3)
                done();
            })
          })
        })
      })
    })
  })
},

function get_queue_attributes(done) {
  cqs.GetQueueAttributes('bar', function(er, attrs) {
    if(er) throw er;

    assert.equal(attrs.VisibilityTimeout, state.bar.VisibilityTimeout, "Should be bar's visibility timeout");
    assert.equal(attrs.VisibilityTimeout,                         111, "Should be bar's visibility timeout");

    cqs.GetQueueAttributes(state.foo, '--force', ['all'], function(er, attrs) {
      if(er) throw er;

      assert.equal(attrs.VisibilityTimeout, state.foo.VisibilityTimeout, "Should be bar's visibility timeout");
      assert.equal(attrs.VisibilityTimeout,                         1.5, "Should be bar's visibility timeout");

      done();
    })
  })
},

function specify_message_id(done) {
  var extra = 'the-extra-stuff-HERE';
  var body = {'about':'This needs the extra id', 'I expect':extra};
  cqs.SendMessage('foo', body, extra, function(er, sent) {
    if(er) throw er;
    var sent_extra = sent.MessageId.slice(sent.MessageId.length - extra.length);
    assert.equal(sent_extra, extra, "Send with extra id field: " + extra);

    cqs.ReceiveMessage('foo', function(er, msg) {
      if(er) throw er;

      var received_extra = msg[0].MessageId.slice(msg[0].MessageId.length - extra.length);
      assert.equal(received_extra, extra, "Should get the right ID extra: " + extra);
      msg[0].del(done);
    })
  })
},

function check_message_deletion(done) {
  state.foo.send('to be kept', function(er) {
    if(er) throw er;
    state.foo.send('to be deleted', function(er) {
      if(er) throw er;

      state.foo.receive(2, function(er, msgs) {
        if(er) throw er;
        assert.equal(msgs.length, 2, "Should get both messages");

        var to_keep = msgs[0], to_del = msgs[1];
        to_del.del(function(er) {
          if(er) throw er;
          to_keep.update(function(er) {
            if(er) throw er;
            assert.ok(! to_keep.deleted, "Kept message should not be deleted");
            to_del.update(function(er) {
              if(er) throw er;
              assert.ok(to_del.deleted, "Other message should be deleted");
              to_keep.del(function() {
                done();
              })
            })
          })
        })
      })
    })
  })
},

function change_message_time(done) {
  state.foo.send('to be changed 1', function(er) {
    if(er) throw er;
    state.foo.send('to be changed 2', function(er) {
      if(er) throw er;

      var begin_at = new Date;
      var opts = {'MaxNumberOfMessages':2, 'VisibilityTimeout':60};
      state.foo.receive(opts, function(er, msgs) {
        if(er) throw er;
        assert.equal(msgs.length, 2, "Should get both messages");

        var end_at = new Date
          , txn_ms = end_at - begin_at
          , txn_at = add(begin_at, txn_ms / 2)
          , msg1 = msgs[0]
          , msg2 = msgs[1]
          , checkout_ms
          ;

        checkout_ms = msg1.visible_at - txn_at;
        assert.almost(checkout_ms, 60000, "Message 1 receive should be 60s: " + checkout_ms);

        checkout_ms = msg2.visible_at - txn_at;
        assert.almost(checkout_ms, 60000, "Message 2 receive should be 60s: " + checkout_ms);

        // Seconds style.
        var new_secs = 123;
        begin_at = new Date;
        cqs.ChangeMessageVisibility(msg1, new_secs, function(er, new_msg1) {
          if(er) throw er;

          end_at = new Date;
          txn_ms = end_at - begin_at;
          txn_at = add(begin_at, txn_ms / 2);
          checkout_ms = new_msg1.visible_at - txn_at;

          assert.equal(I(msg1.visible_at), I(new_msg1.visible_at), "Calling message and received message should have the same data");
          assert.almost(checkout_ms, 123 * 1000, "Updated time should have 123 seconds remaining");

          // Timestamp style, also object style.
          begin_at = new Date;
          var new_time = add(begin_at, 321 * 1000);
          msg2.change_visibility(new_time, function(er, new_msg2) {
            if(er) throw er;

            end_at = new Date;
            txn_ms = end_at - begin_at;
            txn_at = add(begin_at, txn_ms);
            checkout_ms = new_msg2.visible_at - txn_at;

            assert.equal(I(msg2.visible_at), I(new_msg2.visible_at), "Calling message and received message need same data");
            assert.equal(new_msg2.visible_at, new_time, "Message visible timestamp expected " + I(new_time) + ": " + I(new_msg2.visible_at));
            assert.almost(checkout_ms, 321 * 1000, "checkout_ms expected 321 seconds: " + checkout_ms);

            msg1.del(function(er) {
              msg2.del(function(er2) {
                done(er || er2);
              })
            })
          })
        })
      })
    })
  })

  function add(timestamp, ms) {
    var res = new Date(timestamp);
    res.setUTCMilliseconds(res.getUTCMilliseconds() + ms);
    return res;
  }
},

function receive_conflict(done) {
  state.foo.send({hopefully:'Receive conflict!'}, function(er) {
    if(er) throw er;

    var real_request = state.foo.db.request;
    assert.equal(typeof real_request, 'function', 'Need to cache request function');

    // Force the same view result to come back to both receivers, so they attempt to receive the same message.
    var first_callback, runs = 0;
    state.foo.db.request = function(opts, callback) {
      runs += 1;

      assert.ok(runs < 3, 'Only 2 runs allowed');
      if(runs == 1)
        assert.ok(!first_callback, 'Should not have a callback registered this first run');
      if(runs == 2)
        assert.ok(first_callback , 'Should have a callback registered this second run');

      if(runs == 1)
        first_callback = callback;
      else {
        real_request.apply(this, [opts, dual_callback]);
        state.foo.db.request = real_request; // Reset it back to normal.
      }

      function dual_callback() {
        first_callback.apply(this, arguments);
        callback.apply(this, arguments);
      }
    }

    var results = {};
    function result(label, val) {
      results[label] = val;
      if(Object.keys(results).length == 2)
        check_results(results.first, results.second);
    }

    state.foo.receive(1, function(er, msgs) {
      if(er) throw er;
      result('first', msgs);
    })

    state.foo.receive(1, function(er, msgs) {
      if(er) throw er;
      result('second', msgs);
    })

    function check_results(msgs1, msgs2) {
      assert.equal(msgs1.length + msgs2.length, 1, 'One message between the two receive batches');
      assert.ok(msgs1.length == 0 || msgs2.length == 0, 'One batch got no messages');

      var msg = msgs1[0] || msgs2[0];
      assert.ok(msg, 'Got the message despite conflict');
      assert.equal(msg.Body.hopefully, 'Receive conflict!', 'Got the correct message despite conflict');

      done();
    }
  })
},

] // TESTS
