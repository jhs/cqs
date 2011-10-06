// Defaultable APIs
//
// Copyright 2011 Iris Couch
//
//    Licensed under the Apache License, Version 2.0 (the "License");
//    you may not use this file except in compliance with the License.
//    You may obtain a copy of the License at
//
//        http://www.apache.org/licenses/LICENSE-2.0
//
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an "AS IS" BASIS,
//    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//    See the License for the specific language governing permissions and
//    limitations under the License.

module.exports = good_args(defaultable);
module.exports.def   = good_args(fresh_defaultable);
module.exports.merge = merge_obj;

var path_lib = require('path');
var real_require = require;


function fresh_defaultable(_mod, _defs, _definer) {
  var mod = defaultable.apply(this, arguments);
  mod.defaults._defaultable.fresh = true;
  return mod;
}


function defaultable(real_module, initial_defs, definer) {
  if(!real_module || !real_module.exports)
    throw new Error('Need to provide the module, with .exports object');

  if(!is_obj(initial_defs))
    throw new Error('Defaults must be an object');

  var mod_dir = path_lib.dirname(real_module.filename);
  var mod_require = real_module.require || workaround_require;

  workaround_require._defaultable = true;
  function workaround_require(path) {
    if(/^\.\//.test(path) || /^\.\.\//.test(path))
      path = path_lib.resolve(mod_dir, path);
    return real_require(path);
  }

  var defaulter = make_defaulter({});
  real_module.exports = defaulter(initial_defs);
  return real_module.exports;

  function make_defaulter(old_defs) {
    defaulter._defaultable = {};
    return defaulter;

    function defaulter(new_defs) {
      var faux_exports = {};
      var faux_module = {"exports":faux_exports};
      var final_defs = merge_obj(new_defs || {}, old_defs);

      require._defaultable = true;
      function require(path) {
        var mod = mod_require(path);
        if(mod.defaults && typeof mod.defaults === 'function' && mod.defaults._defaultable && !mod.defaults._defaultable.fresh)
          return mod.defaults(final_defs);
        return mod;
      }

      definer(faux_module, faux_exports, final_defs, require);

      var api = faux_module.exports;
      if('defaults' in api)
        throw new Error('defaultable modules may not export a label called "defaults"');
      else
        api.defaults = make_defaulter(final_defs);

      return api;
    }
  }
}


// Recursively merge higher-priority values into previously-set lower-priority ones.
function merge_obj(high, low) {
  if(!is_obj(high))
    throw new Error('Bad merge high-priority');
  if(!is_obj(low))
    throw new Error('Bad merge low-priority');

  var keys = [];
  function add_key(k) {
    if(!~ keys.indexOf(k))
      keys.push(k);
  }

  Object.keys(high).forEach(add_key);
  Object.keys(low).forEach(add_key);

  var result = {};
  keys.forEach(function(key) {
    var high_val = high[key];
    var low_val = low[key];

    if(is_obj(high_val) && is_obj(low_val))
      result[key] = merge_obj(high_val, low_val);
    else if (key in high)
      result[key] = high[key];
    else if (key in low)
      result[key] = low[key];
    else
      throw new Error('Unknown key type: ' + key);
  })

  return result;
}


//
// Utilities
//

function good_args(func) {
  // Make a function validate its parameters.
  return good;

  function good(_Mod, _Defs, _Definer) {
    var args = Array.prototype.slice.call(arguments);
    var m0dule = { 'exports': {} };

    if(args.length == 1)
      return func(m0dule, {}, args[0]);
    else if(args.length == 2)
      return func(m0dule, args[0], args[1]);
    else if(args.length > 2)
      return func.apply(this, args);
    else
      throw new Error('Unknown arguments: ' + JSON.stringify(args));
  }
}

function is_obj(val) {
  return val && !Array.isArray(val) && (typeof val === 'object')
}
