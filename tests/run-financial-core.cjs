const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const nodeCrypto = require('node:crypto');

const memory = new Map();
const asyncStorage = {
  getItem: async key => memory.has(key) ? memory.get(key) : null,
  setItem: async (key, value) => { memory.set(key, value); },
  removeItem: async key => { memory.delete(key); },
  multiSet: async pairs => pairs.forEach(([key, value]) => memory.set(key, value)),
  multiGet: async keys => keys.map(key => [key, memory.has(key) ? memory.get(key) : null]),
  multiRemove: async keys => keys.forEach(key => memory.delete(key)),
};
const cloudBuilder = {
  upsert: async () => ({ error: null }),
  select() { return this; },
  eq() { return this; },
  maybeSingle: async () => ({ data: null, error: null }),
};
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === '@react-native-async-storage/async-storage') return asyncStorage;
  if (request === 'expo-sqlite/kv-store') return asyncStorage;
  // Financial-core Node tests exercise the web compatibility path. Keep the
  // native Expo SQLite package out of Node's ESM resolver; native SQLite has a
  // separate integration gate and must never be claimed by this test.
  if (request === 'expo-sqlite') {
    return {
      openDatabaseAsync: async () => {
        throw new Error('expo_sqlite_native_not_available_in_node_gate');
      },
    };
  }
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  if (request === 'expo-secure-store') {
    return {
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
      isAvailableAsync: async () => false,
      getItemAsync: async key => asyncStorage.getItem(key),
      setItemAsync: async (key, value) => asyncStorage.setItem(key, value),
    };
  }
  if (request === 'expo-crypto') {
    return {
      CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
      digestStringAsync: async (_algorithm, value) => nodeCrypto.createHash('sha256').update(String(value)).digest('hex'),
      getRandomBytes: size => new Uint8Array(nodeCrypto.randomBytes(size)),
      randomUUID: () => nodeCrypto.randomUUID(),
    };
  }
  if (request === 'expo-document-picker') return { getDocumentAsync: async () => ({ canceled: true }) };
  if (request === 'expo-file-system' || request === 'expo-file-system/legacy') {
    return {
      documentDirectory: 'memory://',
      EncodingType: { UTF8: 'utf8', Base64: 'base64' },
      writeAsStringAsync: async () => {},
      readAsStringAsync: async () => '',
    };
  }
  if (request === 'expo-sharing') return { isAvailableAsync: async () => false, shareAsync: async () => {} };
  if (request === '../lib/supabase' && parent?.filename?.endsWith(`${path.sep}src${path.sep}store${path.sep}useStore.js`)) {
    return { supabase: { from: () => cloudBuilder } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const transform = (filename) => babel.transformFileSync(filename, {
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

const filename = path.join(__dirname, 'financial-core.test.mjs');
const testModule = new Module(filename, module);
testModule.filename = filename;
testModule.paths = Module._nodeModulePaths(path.dirname(filename));
testModule._compile(transform(filename), filename);
