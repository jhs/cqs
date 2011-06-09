// The Couch Queue Service API
//

var couch = require('./couch')
  , queue = require('./queue')
  , message = require('./message')
  ;

module.exports = { 'Db': couch.Database
                 , 'Queue': queue.Queue
                 , 'Message': message.Message
                 }
