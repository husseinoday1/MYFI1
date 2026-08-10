const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

const transform = filename => babel.transformFileSync(filename, {
  babelrc: false,
  configFile: false,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code;

const filename = path.join(__dirname, 'sync-scenarios.test.mjs');
const testModule = new Module(filename, module);
testModule.filename = filename;
testModule.paths = Module._nodeModulePaths(path.dirname(filename));
testModule._compile(transform(filename), filename);
