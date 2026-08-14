const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const notifications = read('src/lib/notifications.js');
assert(!/^import\s+.*expo-notifications/m.test(notifications), 'expo-notifications must not be statically imported');
assert(notifications.includes("import Constants from 'expo-constants';"), 'Expo runtime detection missing');
assert(notifications.includes('const isExpoGoAndroid'), 'Expo Go Android guard missing');
assert(notifications.includes("import('expo-notifications')"), 'lazy expo-notifications import missing');
assert(notifications.indexOf('if (isWeb || isExpoGoAndroid) return null;') < notifications.indexOf("import('expo-notifications')"), 'Expo Go guard must run before expo-notifications import');

const calc = read('src/utils/calc.js');
assert(calc.includes("from '../lib/dateCore';"), 'calc must use shared date core');
for (const signature of [
  'export const monthlyForecast',
  'export const getUpcomingRecurring',
  'export const buildFinancialSnapshot',
  'export const buildFinancialReport',
]) {
  const start = calc.indexOf(signature);
  assert(start >= 0, `missing ${signature}`);
  const chunk = calc.slice(start, start + 900);
  assert(chunk.includes('asDate(date)'), `${signature} must normalize incoming dates`);
}

const commitments = read('src/lib/commitments.js');
assert(commitments.includes("from './dateCore';"), 'commitments must not import date helpers from calc');
assert(commitments.includes('const safeDate = asDate(date);'), 'commitment date normalization missing');

const forecast = read('src/lib/financialForecast.js');
assert(forecast.includes("from './dateCore';"), 'financialForecast must use date core');
assert(forecast.includes('const d = asDate(date);'), 'financialForecast month key must normalize date');

const transactionAccess = read('src/lib/transactionAccess.js');
assert(transactionAccess.includes("from './dateCore';"), 'transactionAccess must use date core');

(async () => {
  const dateCoreSource = read('src/lib/dateCore.js');
  const url = `data:text/javascript;base64,${Buffer.from(dateCoreSource).toString('base64')}`;
  const dateCore = await import(url);
  const samples = [
    new Date('2026-08-12T12:00:00'),
    '2026-08-12T12:00:00',
    1786536000000,
    undefined,
    { invalid: true },
  ];
  for (const sample of samples) {
    const result = dateCore.asDate(sample);
    assert(result instanceof Date && !Number.isNaN(result.getTime()), 'asDate must always return a valid Date');
    assert.equal(typeof result.getFullYear, 'function', 'normalized date must expose getFullYear');
  }

  const srcRoot = path.join(root, 'src');
  const files = [];
  const walk = dir => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (name.endsWith('.js')) files.push(full);
    }
  };
  walk(srcRoot);

  const graph = new Map(files.map(file => [file, []]));
  const importRe = /(?:import[\s\S]*?from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g;
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = importRe.exec(source))) {
      const spec = match[1];
      if (!spec.startsWith('.')) continue;
      const base = path.resolve(path.dirname(file), spec);
      const candidates = [base, `${base}.js`, path.join(base, 'index.js')];
      const target = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (target && graph.has(target)) graph.get(file).push(target);
    }
  }

  const state = new Map();
  const stack = [];
  const visit = file => {
    state.set(file, 1);
    stack.push(file);
    for (const next of graph.get(file) || []) {
      if (state.get(next) === 1) {
        const pos = stack.indexOf(next);
        const cycle = [...stack.slice(pos), next].map(x => path.relative(root, x)).join(' -> ');
        throw new Error(`local import cycle detected: ${cycle}`);
      }
      if (!state.get(next)) visit(next);
    }
    stack.pop();
    state.set(file, 2);
  };
  for (const file of files) if (!state.get(file)) visit(file);

  console.log('MYFI RUNTIME HOTFIX V4.2: PASSED');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
