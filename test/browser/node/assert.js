define([], function() {
  var exports = {};

  exports.ok = function(expr, message) {
    if(typeof expr === 'string' || expr)
      return;
    throw new Error(message || 'assert.ok');
  }

  exports.equal = function(a, b, message) {
    if(a != b)
      throw new Error(message || 'assert.equal');
  }

  return exports;
})
