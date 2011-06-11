# CouchDB Queue Service

CQS is a message queue system, using Apache CouchDB.

CQS is **exactly like [Amazon Simple Queue Service (SQS)][sqs_api]**. The API is the same. Everything is exactly the same.

Use CQS if:

* You use NodeJS
* You know (or appreciate) Amazon SQS
* You want the same thing, but on your own server

Install it with NPM:

    $ npm install cqs

[sqs_api]: http://docs.amazonwebservices.com/AWSSimpleQueueService/latest/APIReference/

## API

Initialize the CQS module to point to a database on your couch.

    // A normal import.
    var cqs = require('../api');
    
    // Pre-apply my couch and db name.
    cqs = cqs.defaults({ "couch": "https://user:password@example.iriscouch.com"
                       , "db"   : "cqs_queue"
                       });

### List Queues

    cqs.ListQueues(function(err, queues) {
      console.log("Found " + queues.length + " queues:");
      queues.forEach(function(queue) {
        console.log("  * " + queue.name);
      })

      /* Output */
      // Found 2 queues:
      //   * a_queue
      //   * another_queue
    })

### Create Queues

    // Just create with a name.
    cqs.CreateQueue("important_stuff", function(err, queue) {
      console.log("Important stuff queue is ready");
    })

    // Create with an options object.
    var opts = { QueueName               : "unimportant_stuff"
               , DefaultVisibilityTimeout: 3600 // 1 hour
               };

    cqs.CreateQueue(opts, function(er, queue) {
      console.log("Created " + queue.name + " with timeout + " queue.VisibilityTimeout);

      /* Output */
      // Created unimportant_stuff with timeout 3600
    })
