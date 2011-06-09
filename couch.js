// Couch database
//
// I know maintenance will eventually have to be performed, like purging old documents.
// This is a place where it can go. Maybe in the future you can have dedicated maintenance
// nodes that don't interfere with the main API.
//
// Also, hopefully this file can be ported to browser Javascript and the same code can
// run client-side.

var lib = require('./lib')
  , util = require('util')
  , request = require('request')
  , querystring = require('querystring')
  ;

//
// Constants
//

//
// API
//

function Database (opts) {
  var self = this;

}


module.exports = { "Database" : Database
                 };


//
// Utilities
//
