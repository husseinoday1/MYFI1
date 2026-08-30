const path = require('node:path');
const babel = require('@babel/core');

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

const filename = path.join(__dirname, 'tracker-builder-store.test.mjs');
const Module = require('node:module');
const testModule = new Module(filename, module);
testModule.filename = filename;
testModule.paths = Module._nodeModulePaths(path.dirname(filename));
testModule._compile(transform(filename), filename);
