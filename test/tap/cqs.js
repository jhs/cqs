// CQS tests
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
var test = tap.test
var util = require('util'), I = util.inspect
var request = require('request')

var lib = require('../../lib')
  , COUCH = process.env.cqs_couch || 'http://localhost:5984'
  , DB    = process.env.cqs_db    || 'cqs_test'

if(process.env.charles)
  COUCH = 'http://jhs-mac.local:15984';
  //COUCH = 'http://192.168.3.10:15984';

var time_C = parseFloat("" + (process.env.timeout_coefficient || process.env.C || 1.0));
var cqs = require('../../api').defaults({ 'couch' : COUCH
                                        , 'db'    : DB
                                        , 'time_C': time_C
                                        , browser_attachments: !! process.env.test_browser
                                        })
var state = {};

test('CQS setup', function(t) {
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

      t.ok(true, 'Set up CQS test environment')
      t.end()
    })
  })
})

test('Create queue', function(t) {
  cqs.CreateQueue('foo', function(er, queue) {
    if(er) throw er
    t.equal(queue.name, 'foo', "CreateQueue returns the queue name");
    state.foo = queue;
    state.log = state.foo.log;
    t.end()
  })
})

test('Create queue with object', function(t) {
  cqs.CreateQueue({name:'bar', DefaultVisibilityTimeout:111}, function(er, queue) {
    if(er) throw er
    t.equal(queue.name, 'bar', "CreateQueue returns the queue name");
    t.equal(queue.VisibilityTimeout, 111, "Created with visibility 111");
    state.bar = queue;
    t.end()
  })
})

test('Instantiating a queue loads from cache', function(t) {
  var should_be_bar = new cqs.Queue('bar');
  var start_at = new Date;
  should_be_bar.confirm(function(er) {
    if(er) throw er
    var end_at = new Date;

    t.equal(should_be_bar.VisibilityTimeout, 111, "Should get bar's visibility timeout");
    t.equal(should_be_bar.VisibilityTimeout, state.bar.VisibilityTimeout, "Should get bar's visibility timeout");
    t.ok(end_at - start_at < 20, "Bar should be known from cache within 50ms");
    t.end()
  })
})

test('List queues', function(t) {
  cqs.ListQueues(function(er, queues) {
    if(er) throw er;
    t.equal(2, queues.length);

    t.any(queues, "Queue list should include foo", function(q) { return q.name == 'foo' });
    t.any(queues, "Queue list should include bar", function(q) { return q.name == 'bar' });
    t.end()
  })
})

test('List queues with prefix', function(t) {
  cqs.ListQueues('f', function(er, queues) {
    if(er) throw er;
    t.equal(1, queues.length);

    function is_foo(q) { return q.name == 'foo' }
    function is_bar(q) { return q.name == 'bar' }

    t.none(queues, "Queues should not have bar", is_bar);
    t.any(queues , "Queues should have foo"    , is_foo);

    cqs.ListQueues('b', function(er, queues) {
      if(er) throw er;
      t.equal(1, queues.length);
      t.none(queues, "Queues should not have foo", is_foo);
      t.any(queues , "Queues should have bar"    , is_bar);
      t.end()
    })
  })
})

test('Send message', function(t) {
  state.bar.send({this_is:'Message one'}, function(er, msg) {
    if(er) throw er;

    // TODO: confirm MD5.

    ; ["Body", "MD5OfMessageBody", "MessageId"].forEach(function(key) {
      t.ok(key in msg, "SendMessage result needs key: " + key);
    })

    t.equal(msg.Body.this_is, 'Message one', "Message body should be what was sent");

    state.message_one = msg;
    t.end()
  })
})

test('Message sending failures', function(t) {
  cqs.SendMessage('bad_queue', 'Message for non-existent queue', function(er) {
    t.ok(er, 'Got an error sending a message to a non-existent queue')
    t.equal(er.message, 'Queue does not exist: bad_queue', 'Useful error message sending to non-queue')

    var non_queue = new cqs.Queue('bad_queue_2')
    non_queue.confirmed('--allow-missing', function(er) {
      t.notOk(er, 'No problem confirming missing queue with --allow-missing')
      non_queue.send('Another message for non-queue', function(er) {
        t.ok(er, 'Failure creating a message for non-queue with --allow-missing')
        t.equal(er.statusCode, 403, 'CouchDB 403 forbidden (invalid change) creating message for a non-queue')
        t.equal(er.reason, 'Queue does not exist: bad_queue_2', 'Useful CouchDB error message when sending to a non-queue')
        t.end()
      })
    })
  })
})

test('Receive no message', function(t) {
  cqs.ReceiveMessage(state.foo, function(er, messages) {
    if(er) throw er;

    t.equal(messages.length, 0, 'Foo queue should not have any messages yet');
    t.end()
  })
})

test('Receive message', function(t) {
  state.bar.receive(function(er, messages) {
    if(er) throw er;

    t.equal(messages.length, 1, 'Bar queue should have message from earlier');
    var msg = messages[0];
    t.equal(msg.Body.this_is, state.message_one.Body.this_is, "Message should be message one's body");
    t.equal(msg.Body.this_is, 'Message one'                 , "Message should be message one's body");

    // Deliberately leaving this message in the queue, to help expose errors,
    // such as incomplete timeouts.
    t.end()
  })
})

test('Set queue attributes', function(t) {
  cqs.SetQueueAttributes(state.foo, {'VisibilityTimeout':1.5}, function(er) {
    if(er) throw er;

    t.equal(state.foo.VisibilityTimeout, 1.5, "Foo should have 1.5 second visibility now");
    new cqs.Queue('foo').confirmed(function(er, foo2) {
      if(er) throw er;

      t.equal(foo2.VisibilityTimeout, state.foo.VisibilityTimeout, "Both foos should be 1.5");
      t.equal(foo2.VisibilityTimeout,                         1.5, "Both foos should be 1.5");

      t.end()
    })
  })
})

test('Make sure new message has the attributes', function(t) {
  cqs.SendMessage(state.foo, "Should be 1.5 visibility timeout", function(er) {
    if(er) throw er;
    var before = new Date;
    cqs.ReceiveMessage(state.foo, function(er, msg) {
      if(er) throw er;

      var now = new Date;
      var query_ms = now - before;
      msg = msg[0];

      var invisible_ms = (msg.visible_at - now) + (query_ms / 2);
      t.ok(invisible_ms > 1000, "Not-visible time (should be 1500): " + invisible_ms);

      state.half_sec = msg;
      t.end()
    })
  })
})

//{'timeout_coefficient': 10},
test('Delete message', function(t) {
  var now = new Date;
  var vis_at = state.half_sec.visible_at;
  if(!vis_at)
    throw new Error('Missing "half_sec" message in testing state')

  t.ok(vis_at - now > 0, "Too late to run this test: " + (vis_at - now));

  cqs.DeleteMessage(state.half_sec, function(er) {
    if(er) throw er;

    function check() {
      cqs.ReceiveMessage('foo', function(er, msg) {
        if(er) throw er;
        t.equal(msg.length, 0, "Should be no more messages left: " + I(msg));
        t.end()
      })
    }

    var remaining = vis_at - (new Date);
    if(remaining < 0)
      check();
    else
      setTimeout(check, remaining * 1.10);
  })
})

//{'timeout_coefficient': 2},
test('Send message API', function(t) {
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
            t.end()
          })
        })
      })
    })
  })
})

//{'timeout_coefficient': 2},
test('Receive message API', function(t) {
  var messages = [];

  cqs.ReceiveMessage('api_tests', function(er, msg) {
    if(er) throw er;
    t.equal(msg.length, 1, "Should receive 1 message");
    t.equal(msg[0].Body, 'API with string arg', 'Messages should arrive in order');

    messages.push(msg[0]);
    cqs.ReceiveMessage(state.api_tests, 1, function(er, msg) {
      if(er) throw er;
      t.equal(msg.length, 1, "Should receive 1 message");
      t.equal(msg[0].Body, 'API with queue arg', 'Messages should arrive in order');

      messages.push(msg[0]);
      cqs.ReceiveMessage({queue:state.api_tests, 'MaxNumberOfMessages': 1}, function(er, msg) {
        if(er) throw er;
        t.equal(msg.length, 1, "Should receive 1 message");
        t.equal(msg[0].Body.call_type, 'Method with object body', 'Messages should arrive in order');

        messages.push(msg[0]);
        state.api_tests.receive(1, function(er, msg) {
          if(er) throw er;
          t.equal(msg.length, 1, "Should receive 1 message");
          t.equal(msg[0].Body, 'queue method call', 'Messages should arrive in order');

          messages.push(msg[0]);

          var deleted = 0;
          messages.forEach(function(msg) {
            msg.del(function() {
              deleted += 1;
              if(deleted == 3)
                t.end()
            })
          })
        })
      })
    })
  })
})

test('Get queue attributes', function(t) {
  cqs.GetQueueAttributes('bar', function(er, attrs) {
    if(er) throw er;

    t.equal(attrs.VisibilityTimeout, state.bar.VisibilityTimeout, "Should be bar's visibility timeout (state)")
    t.equal(attrs.VisibilityTimeout,                         111, "Should be bar's visibility timeout (hard-coded)")

    cqs.GetQueueAttributes(state.foo, '--force', ['all'], function(er, attrs) {
      if(er) throw er;

      t.equal(attrs.VisibilityTimeout, state.foo.VisibilityTimeout, "Should be foo's visibility timeout (state)")
      t.equal(attrs.VisibilityTimeout,                         1.5, "Should be foo's visibility timeout (hard-coded)")

      t.end()
    })
  })
})

test('Specify message id', function(t) {
  var extra = 'the-extra-stuff-HERE';
  var body = {'about':'This needs the extra id', 'I expect':extra};
  cqs.SendMessage('foo', body, extra, function(er, sent) {
    if(er) throw er;
    var sent_extra = sent.MessageId.slice(sent.MessageId.length - extra.length);
    t.equal(sent_extra, extra, "Send with extra id field: " + extra);

    cqs.ReceiveMessage('foo', function(er, msg) {
      if(er) throw er;

      var received_extra = msg[0].MessageId.slice(msg[0].MessageId.length - extra.length);
      t.equal(received_extra, extra, "Should get the right ID extra: " + extra);
      msg[0].del(function(er) {
        t.notOk(er, 'Delete message with extra stuff')
        t.end()
      })
    })
  })
})

test('Check message deletion', function(t) {
  state.foo.send('to be kept', function(er) {
    if(er) throw er;
    state.foo.send('to be deleted', function(er) {
      if(er) throw er;

      state.foo.receive(2, function(er, msgs) {
        if(er) throw er;
        t.equal(msgs.length, 2, "Should get both messages");

        var to_keep = msgs[0], to_del = msgs[1];
        to_del.del(function(er) {
          if(er) throw er;
          to_keep.update(function(er) {
            if(er) throw er;
            t.ok(! to_keep.deleted, "Kept message should not be deleted");
            to_del.update(function(er) {
              if(er) throw er;
              t.ok(to_del.deleted, "Other message should be deleted");
              to_keep.del(function() {
                t.end()
              })
            })
          })
        })
      })
    })
  })
})

test('Change message time', function(t) {
  state.foo.send('to be changed 1', function(er) {
    if(er) throw er;
    state.foo.send('to be changed 2', function(er) {
      if(er) throw er;

      var begin_at = new Date;
      var opts = {'MaxNumberOfMessages':2, 'VisibilityTimeout':60};
      state.foo.receive(opts, function(er, msgs) {
        if(er) throw er;
        t.equal(msgs.length, 2, "Should get both messages");

        var end_at = new Date
          , txn_ms = end_at - begin_at
          , txn_at = add(begin_at, txn_ms / 2)
          , msg1 = msgs[0]
          , msg2 = msgs[1]
          , checkout_ms
          ;

        checkout_ms = msg1.visible_at - txn_at;
        t.almost(checkout_ms, 60000, "Message 1 receive should be 60s: " + checkout_ms);

        checkout_ms = msg2.visible_at - txn_at;
        t.almost(checkout_ms, 60000, "Message 2 receive should be 60s: " + checkout_ms);

        // Seconds style.
        var new_secs = 123;
        begin_at = new Date;
        cqs.ChangeMessageVisibility(msg1, new_secs, function(er, new_msg1) {
          if(er) throw er;

          end_at = new Date;
          txn_ms = end_at - begin_at;
          txn_at = add(begin_at, txn_ms / 2);
          checkout_ms = new_msg1.visible_at - txn_at;

          t.equal(I(msg1.visible_at), I(new_msg1.visible_at), "Calling message and received message should have the same data");
          t.almost(checkout_ms, 123 * 1000, "Updated time should have 123 seconds remaining");

          // Timestamp style, also object style.
          begin_at = new Date;
          var new_time = add(begin_at, 321 * 1000);
          msg2.change_visibility(new_time, function(er, new_msg2) {
            if(er) throw er;

            end_at = new Date;
            txn_ms = end_at - begin_at;
            txn_at = add(begin_at, txn_ms);
            checkout_ms = new_msg2.visible_at - txn_at;

            t.equal(I(msg2.visible_at), I(new_msg2.visible_at), "Calling message and received message need same data");
            t.equal(new_msg2.visible_at, new_time, "Message visible timestamp expected "+I(new_time)+": "+I(new_msg2.visible_at))
            t.almost(checkout_ms, 321 * 1000, "checkout_ms expected 321 seconds: " + checkout_ms);

            msg1.del(function(er) {
              t.notOk(er, 'Delete message 1')
              msg2.del(function(er2) {
                t.notOk(er2, 'Delete message 2')
                t.end()
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
})

test('Receive conflict', function(t) {
  state.foo.send({hopefully:'Receive conflict!'}, function(er) {
    if(er) throw er;

    var real_request = state.foo.db.request;
    t.equal(typeof real_request, 'function', 'Need to cache request function');

    // Force the same view result to come back to both receivers, so they attempt to receive the same message.
    var first_callback, recv_results = [];
    var runs = {'find':0, 'recv':0};

    state.foo.db.request = function(opts, callback) {
      var run_type = null;
      if(typeof opts == 'string' && opts.match(/_view\/visible_at/))
        run_type = 'find';
      else if(opts.method == 'PUT' && opts.uri.match(/^CQS%2Ffoo%2F/i))
        run_type = 'recv';

      t.ok(run_type, 'Unknown query: ' + JSON.stringify(opts));
      runs[run_type] += 1;
      t.ok(runs[run_type] <= 2, 'Only 2 '+run_type+' runs allowed');

      if(run_type == 'find' && runs.find == 1)
        first_callback = callback; // Store this callback for later, to send it the same response as the next run.

      else if(run_type == 'find')
        real_request.apply(this, [opts, function() {
          first_callback.apply(this, arguments);
          callback.apply(this, arguments);
        }]);

      else if(run_type == 'recv')
        real_request.apply(this, [opts, function(er, resp, body) {
          recv_results.push(er);
          callback.apply(this, [er, resp, body]);
        }]);
    } // state.foo.db.request

    var results = {};
    function result(label, val) {
      results[label] = val;
      if(Object.keys(results).length == 2) {
        state.foo.db.request = real_request; // Back to normal.
        check_results(results.first, results.second, recv_results[0], recv_results[1]);
      }
    }

    state.foo.receive(1, function(er, msgs) {
      if(er) throw er;
      result('first', msgs);
    })

    state.foo.receive(1, function(er, msgs) {
      if(er) throw er;
      result('second', msgs);
    })

    function check_results(msgs1, msgs2, err1, err2) {
      t.equal(msgs1.length + msgs2.length, 1, 'One message between the two receive batches');
      t.ok(msgs1.length == 0 || msgs2.length == 0, 'One batch got no messages');

      var msg = msgs1[0] || msgs2[0];
      t.ok(msg, 'Got the message despite conflict');
      t.equal(msg.Body.hopefully, 'Receive conflict!', 'Got the correct message despite conflict');

      t.ok(err1 || err2, 'One of the receive requests should have returned an error');
      t.ok(!err1 || !err2, 'One of the receive request should have returned normally');

      var err = err1 || err2;
      t.equal(err.statusCode, 409, 'The HTTP error should be 409');
      t.equal(err.error, 'conflict', 'The Couch error should be "conflict"');

      t.end()
    }
  })
})

test('Follow changes', function(t) {
  var changes = state.foo.changes()

  var unexpectedMessage = function() {
    throw new Error('unexpected message')
  }

  var receiveChange = function() {
    changes.once('message', function(msg) {
      t.equal(msg.Body, 'msg2')
      msg.del(function(er) {
        if(er) throw er;
        changes.stop();
        t.end()
      })
    })
    changes.removeListener('message', unexpectedMessage);
    changes.resume();
  }

  var testPaused = function() {
    changes.pause()

    state.foo.send('msg2', function(er) {
      if(er) throw er;

      setTimeout(receiveChange, 100);
    })
  }

  changes.once('message', function(msg) {
    t.equal(msg.Body, 'msg1')

    changes.on('message', unexpectedMessage)

    msg.del(function(er) {
      if(er) throw er;

      //should not receive messages from other queues
      state.bar.send('noMsg', function(er){
        if(er) throw er;
        testPaused();
      })
    })
  })

  state.foo.send('msg1', function(er) {
    if(er) throw er;
  })
})
