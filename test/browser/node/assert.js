define([], function() {
  var exports = {};

  function thr0w(er) {
    if(process.exceptions)
      process.exceptions.emit('exception', er);
    else
      throw er;
  }

  exports.ok = function(expr, message) {
    if(typeof expr === 'string' || expr)
      return;
    thr0w(new Error(message || 'assert.ok'));
  }

  exports.equal = function(a, b, message) {
    var er;
    if(a != b) {
      er = new Error(message || 'assert.equal');
      console.log('Not equal');
      console.log(er);
      thr0w(er);
    }
  }

  return exports;
})
