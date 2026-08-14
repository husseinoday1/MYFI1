const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'android' } };
  if (request === 'expo-sqlite') return {};
  return originalLoad.call(this, request, parent, isMain);
};

const transform = filename => babel.transformFileSync(filename, {
  babelrc: false,
  configFile: false,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code;

const originalJs = require.extensions['.js'];
require.extensions['.js'] = (targetModule, filename) => {
  if (filename.includes(`${path.sep}src${path.sep}`)) {
    targetModule._compile(transform(filename), filename);
    return;
  }
  originalJs(targetModule, filename);
};

const filename = path.join(__dirname, 'financial-ledger-v7-runtime.test.mjs');
const testModule = new Module(filename, module);
testModule.filename = filename;
testModule.paths = Module._nodeModulePaths(path.dirname(filename));
testModule._compile(transform(filename), filename);
