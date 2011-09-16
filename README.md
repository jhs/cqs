# CouchDB Queue Service

CQS is a message queue system, using Apache CouchDB. It is **exactly like** [Amazon Simple Queue Service (SQS)][sqs_api]. The API is the same. Everything is exactly the same, it just runs on CouchDB.

CQS is implented in Javascript and supports:

* NodeJS
* Google Chrome 12
* Firefox 3.5, Firefox 3.6, Firefox 4
* Safari 5
* Internet Explorer 8, Internet Explorer 9

Use CQS if you use Javascript, you know (or appreciate) Amazon SQS, and you *want the same thing on your server*.

For Node, install with NPM.

    $ npm install cqs

The test script `test/run.js` will copy itself into a Couch app which you can run from the browser.

[sqs_api]: http://docs.amazonwebservices.com/AWSSimpleQueueService/latest/APIReference/

## API

Initialize the CQS module to point to a database on your couch.

    // A normal import.
    var cqs = require('cqs');

    // Pre-apply my couch and db name.
    cqs = cqs.defaults({ "couch": "https://user:password@example.iriscouch.com"
                       , "db"   : "cqs_queue"
                       });

### List Queues

    cqs.ListQueues(function(error, queues) {
      console.log("Found " + queues.length + " queues:");
      queues.forEach(function(queue) {
        console.log("  * " + queue.name);
      })

      // Output:
      // Found 2 queues:
      //   * a_queue
      //   * another_queue
    })

### Create Queues

Creating queues requires **database administrator** access.

    // Just create with a name.
    cqs.CreateQueue("important_stuff", function(error, queue) {
      if(!error)
        console.log("Important stuff queue is ready");
    })

    // Create with an options object.
    var opts = { QueueName               : "unimportant_stuff"
               , DefaultVisibilityTimeout: 3600 // 1 hour
               , browser_attachments     : true // Attach browser libs and test suite
               };

    cqs.CreateQueue(opts, function(error, queue) {
      if(!error)
        console.log("Created " + queue.name + " with timeout + " queue.VisibilityTimeout);

      // Output
      // Created unimportant_stuff with timeout 3600
    })

### Send a Message

Everything is like SQS, except the message body is any JSON value.

    // The convenient object API:
    important_stuff.send(["keep these", "things", "in order"], function(error, message) {
      if(!error)
        console.log('Sent: ' + JSON.stringify(message.Body));

      // Output:
      // Sent: ["keep these","things","in order"]
    })

    cqs.SendMessage(important_stuff, "This message is important!", function(error, message) {
      if(!error)
        console.log('Sent message: ' + message.Body);

      // Output:
      // Sent message: This message is important!
    })

    // Or, just use the queue name.
    cqs.SendMessage('some_other_queue', {going_to: "the other queue"}, function(error, message) {
      if(!error)
        console.log('Message ' + message.MessageId + ' is going to ' + message.Body.going_to);

      // Output:
      // Message a9b1c48bd6ae433eb7879013332cd3cd is going to the other queue
    })

### Receive a Message

Note, like the SQS API, `ReceiveMessage` always returns a list.

    // The convenient object API:
    my_queue.receive(function(error, messages) {
      if(!error)
        console.log('Received message: ' + JSON.stringify(messages[0].Body));

      // Output:
      // Received message: <message body>
    })

    // The standard API, receiving multiple messages
    cqs.ReceiveMessage(some_queue, 5, function(er, messages) {
      if(!error)
        console.log('Received ' + messages.length + ' messages');

      // Output:
      // Received <0 through 5> messages
    })

### Delete a Message

When a message is "done", remove it from the queue.

    // The convenient object API:
    message.del(function(error) {
      // Message deletion never results in an error. If a message is successfully
      // deleted, it will simply never appear in the queue again.
      console.log('Message deleted!');
    })

    // The standard API:
    cqs.DeleteMessage(my_message, function(error) {
      console.log('Message deleted');
    })

## API Parameters

These parameters are useful with the `.defaults()` method to customize CQS behavior.

* `couch` | URL to CouchDB
* `db` | Database storing the CQS queue
* `time_C` | **Coefficient of timeouts**. CQS treats a delayed response as a failure. Timeout durations (default 0.5s) are multipled by `time_C`.

## Test Suite

The test suite is plain old Javascript, nothing fancy. Just run the `run.js` command in Node.

    $ node test/run.js
    ..................

    Pass   : 18
    Fail   : 0
    Timeout: 0
    Skip   : 0

Use environment variables to set operational parameters, for example:

    env couch=https://admin:secret@example.iriscouch.com C=20 ./tests/run.js

List of variables:

* `cqs_couch` | URL of CouchDB; the `couch` API parameter
* `cqs_db` | Name of database storing the queue; the `db` API parameter
* `C` or `timeout_coefficient` | Timeout coefficient; `time_C` API parameter
* `exit` | Halt all testing on a timeout error
* `skip_browser` | Do not attach the browser test suite Couch app
* `cqs_log_level` | log4js log level (`"debug"` and `"info"` are useful)

### Running tests in the browser

The test suite copies itself into CouchDB as a Couch app. Just visit `/cqs_test/_design/CQS%2fapi_tests/test.html` in your browser.

To simulate environment variables, use the URL query string, for example:

    http://localhost:5984/cqs_test/_design/CQS%2fapi_tests/test.html?C=10&exit=true
