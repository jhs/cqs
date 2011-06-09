#!/usr/bin/env node
// The changes_couchdb command-line interface.
//

var lib = require('./lib')
  , cqs = require('./api')
  ;

function usage() {
  console.log([ 'usage: cli <URL>'
              , ''
              ].join("\n"));
}

console.log('Start');
