// Utilities for node-tap stuff
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

var tap = require('tap')

module.exports = { 'test'  : test
                 }


function test(label, tester) {
  if(process.env.only && process.env.only != label)
    return console.log('# Skipping %s', label)

  tap.test(label, function(t) {
    t.member = member
    t.any    = any
    t.none   = none
    t.almost = almost
    tester(t)
  })
}

function member(elem, list, message) {
  var is_member = false;
  list.forEach(function(list_elem) {
    if(list_elem === elem)
      is_member = true;
  })

  return this.equal(is_member, true, message || 'member')
}


function any(list, message, pred) {
  var found = false
  for(var a = 0; a < list.length; a++)
    if(pred.call(null, list[a]))
      found = true
  return this.equal(found, true, message || 'any')
}


function none(list, message, pred) {
  var found = false
  for(var a = 0; a < list.length; a++)
    if(pred.call(null, list[a]))
      found = true
  return this.equal(found, false, message || 'none')
}


function almost(actual, expected, message) {
  var delta = Math.abs(actual - expected);
  var margin = delta / expected;

  if(margin > 0.10)
    return this.equal(actual, '[almost '+expected+']', message || 'almost')
  else
    return this.ok(true, message || 'almost')
}
