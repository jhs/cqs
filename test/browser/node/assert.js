define([], function() {
  var exports = {};

  exports.ok = function(expr, message) {
    if(!!!expr)
      throw new Error(message || 'assert.ok');
  }

  return exports;
})
