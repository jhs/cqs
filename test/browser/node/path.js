define([], function() {
  var exports = {};

  exports.dirname = function(path) {
    console.log('dirname ' + JSON.stringify(path) + ' = ' + JSON.stringify(path.replace(/\/.*$/, "")));
    return path.replace(/\/.*$/, "");
  }

  return exports;
})
