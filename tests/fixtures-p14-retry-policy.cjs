// CommonJS mirror of src/lib/financialOutboxRetryPolicyV1.js for the restart
// worker, which compiles the repository without babel and so cannot pull in an
// ESM import. Compiled from the real source at require time rather than
// retyped, so it cannot drift from the shipped policy.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

const target = path.join(__dirname, '..', 'src/lib/financialOutboxRetryPolicyV1.js');
if (!fs.existsSync(target)) throw new Error(`retry policy source missing: ${target}`);
const compiled = new Module(target, module);
compiled.filename = target;
compiled.paths = Module._nodeModulePaths(path.dirname(target));
compiled._compile(babel.transformFileSync(target, {
  babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code, target);

module.exports = compiled.exports;
