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

## To Do

I wish CQS had many more features.

* Use one design document instead of one per queue. One design document is better at the low end, multiple design documents are better at the high end. Ideally, we can choose one or the other.
* Management
  * Every API call has a 0.1% chance of running management tasks
  * You could run a dedicated management process so the producers/consumers don't have to worry
  * Purge old messages

<a name="purging"></a>
### Purging CouchDB

CouchDB stores delete operations indefinitely. This allows delete operations to replicate. Unfortunately, deleted documents accumulate, consuming disk space.

Damien describes [CouchDB purging] in the mailing list. Purging permanently removes documents, as if they never existed.  Databases with high create/delete churn ultimately must be purged at some point. Purge operations, by intention, cannot replicate; thus purging is essentially local database maintenance, only done to documents which nobody will ever miss. A final concern is that purging too often will destroy view indexes. Applications using views will be effectively offline until the views rebuild.

The following procedure is a cooperative technique for safe, zero-impact, zero-downtime, purging. Since purging is local to a database, the procedure makes some assumptions:

* There is an *authoritative clock*, used for timestamps. CouchDB `Date` headers indicate this clock's current time.
* Concurrent purges serialize using timestamps and *advisory locking* in a `_local` document

In this procedure, this is the criteria for purging a document:

1. It must be **deleted**
1. It must be sufficiently **old**, defined as
   * *Either* it has a `deleted_at` timestamp, older than **Age** (preferred)
   * *Or* it hasn't a `deleted_at` field, but its update sequence is greater than **Updates** ago

Thus, **Age** and **Updates** are site-specific parameters. Both are effectively a replication deadline. The documents had better finish replicating before the delete becomes **Age** old and before **Updates** subsequent changes! Choosing an age is better (24 hours, or 7 days both seem reasonable); however the update deadline is necessary to purge documents from legacy applications which use HTTP DELETE.

The procedure:

1. *Sanity checks*. These are optional but can reduce the time the lock is held.
  1. *Ping the DB*
    * If compaction is running, abort, otherwise...
    * Remember **update_seq** = `committed_update_seq || update_seq`
    * Remember **now** = the `Date` header
  1. *Freshen the views*. For each design document:
    1. Pick a deterministically random view based on `_id` and `_rev`
    1. Query the view `?reduce=false&limit=1`
    1. Query `_info`. If `purge_seq` changes during this loop, something is wrong. Abort.
1. Fetch `_local/maintenance` which should have an `expires_at` value.
1. If the expiration timestamp is greater than the `Date` header timestamp, abort
1. Store `_local/maintenance` and abort if the request fails
  * Your UUID (pick one at random)
  * `activity = "purge"`
  * `started_at` timestamp = now
  * `expires_at` timestamp when maintenance is expected to be done (5 minutes?)
1. **MAINTENANCE LOCK BEGINS**
  1. Start a timer to abort if `expires_at` occurs
  1. Optionally start a timer before expiration, to attempt to extend it before it occurs
1. Run the *sanity checks* (mandatory). Remember **now** and **update_seq**.
1. Identify `_id`s and `_rev`s to purge (optionally, begin this step immediatly after *ping the db* completes). Ideas:
  * Hit `_changes?since=0`, anything with `"deleted":true` and `seq < update_seq - Updates` can purge
  * Maybe query with `&include_docs=true` and check `deleted_at` vs. **now** - **Age**
  * Maybe a `_changes` filter to do all this server-side?
  * Maybe follow-up on the deleted docs (`POST _all_docs?include_docs=true {"keys":[...]}`) looking for old `deleted_at`
  * If COUCHDB-1252 is done, a view could help: `if(doc._deleted && doc.deleted_at) emit(doc.deleted_at, 1);`
1. Run the purge request
1. *Freshen the views*
1. Purge again with 0 documents. This scrubs the purge operation, which had left copies of IDs and revs in the file.
1. *Freshen the views*
1. Trigger compaction. Optionally poll the db in the background. When `compact_running` becomes false, the documents are gone forever. Fire an event or callback or something.
1. Optionally, release the lock early. Set `expires_at` = **now** and update `_local/maintenance`.
1. **MAINTENANCE LOCK ENDS**

[sqs_api]: http://docs.amazonwebservices.com/AWSSimpleQueueService/latest/APIReference/
[purge]: http://mail-archives.apache.org/mod_mbox/couchdb-dev/200809.mbox/%3CDB2669F6-EDFB-44CB-9406-555B7721BA2F@apache.org%3E
