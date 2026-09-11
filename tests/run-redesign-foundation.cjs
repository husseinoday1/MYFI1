// Runtime contract for the 2026-09-11 redesign foundation:
//   src/ui/shell/navigation.js  — tab/back/FAB rules from glossary.html
//   src/ui/typography.js        — font id + weight -> bundled face
//   src/ui/palette.js, src/lib/theme.js — every legacy theme key resolves
// Source is compiled with babel (as fixtures-p14-retry-policy.cjs does) so the
// shipped modules are exercised, not re-typed copies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');

const cache = new Map();
function load(relative) {
  const target = path.join(root, relative);
  if (cache.has(target)) return cache.get(target).exports;
  const compiled = new Module(target, module);
  compiled.filename = target;
  compiled.paths = Module._nodeModulePaths(path.dirname(target));
  cache.set(target, compiled);
  const code = babel.transformFileSync(target, {
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  // Resolve sibling source modules through this loader, stub react-native, and
  // treat font files (Metro assets) as opaque tokens — but only if they exist.
  compiled.require = (request) => {
    if (request === 'react-native') return { Platform: { OS: 'android', select: (o) => o.android ?? o.default } };
    if (request.startsWith('.')) {
      const resolved = path.resolve(path.dirname(target), request);
      if (resolved.endsWith('.ttf')) {
        assert(fs.existsSync(resolved), `bundled font file exists: ${path.relative(root, resolved)}`);
        return `asset:${path.basename(resolved)}`;
      }
      const file = fs.existsSync(`${resolved}.js`) ? `${resolved}.js` : resolved;
      return load(path.relative(root, file));
    }
    return Module._load(request, compiled);
  };
  compiled._compile(code, target);
  return compiled.exports;
}

// ---- navigation -------------------------------------------------------------
const nav = load('src/ui/shell/navigation.js');

assert.deepEqual(nav.ROOT_TAB_KEYS, ['home', 'followups', 'transactions', 'planning'],
  'exactly four roots, in the approved order');

// Legacy keys keep resolving.
assert.equal(nav.resolveTabKey('trackers'), 'followups');
assert.equal(nav.resolveTabKey('history'), 'transactions');
assert.equal(nav.resolveTabKey('mymoney'), 'planning');
assert.equal(nav.resolveTabKey('more'), 'home');
assert.equal(nav.resolveTabKey(undefined), 'home');

// Start tab accepts only a current root; legacy values migrate.
assert.equal(nav.normalizeStartTab('reports'), 'planning');
assert.equal(nav.normalizeStartTab('settings'), 'home');
assert.equal(nav.normalizeStartTab('trackers'), 'followups');
assert.equal(nav.normalizeStartTab('planning'), 'planning');
assert.equal(nav.normalizeStartTab('bogus'), 'home');

// Persisted config normalization agrees with the shell for every known value.
const { normalizeCfg } = load('src/lib/constants.js');
for (const value of ['home', 'followups', 'transactions', 'planning', 'history', 'reports', 'settings', 'mymoney', 'trackers', 'more', 'bogus', undefined]) {
  assert.equal(normalizeCfg({ startTab: value }).startTab, nav.normalizeStartTab(value), `startTab ${value} agrees`);
}

// Opening a root replaces the stack; a sub-screen pushes; re-opening the top
// screen does not duplicate it.
let stack = nav.initialStack();
stack = nav.openScreen(stack, 'planning');
assert.deepEqual(stack, ['planning']);
stack = nav.openScreen(stack, 'reports');
stack = nav.openScreen(stack, 'reports');
assert.deepEqual(stack, ['planning', 'reports']);
stack = nav.openScreen(stack, 'basira');
assert.deepEqual(stack, ['planning', 'reports', 'basira']);

// Back pops one level at a time — exercised repeatedly, not just once.
let step = nav.goBack(stack);
assert.deepEqual(step, { stack: ['planning', 'reports'], exit: false });
step = nav.goBack(step.stack);
assert.deepEqual(step, { stack: ['planning'], exit: false });
// From a non-Home root, back returns to Home...
step = nav.goBack(step.stack);
assert.deepEqual(step, { stack: ['home'], exit: false });
// ...and from Home the OS takes over, on every press.
step = nav.goBack(step.stack);
assert.deepEqual(step, { stack: ['home'], exit: true });
step = nav.goBack(step.stack);
assert.deepEqual(step, { stack: ['home'], exit: true });

// A sub-screen opened from the drawer on Home returns to Home.
stack = nav.openScreen(['home'], 'settings');
assert.deepEqual(nav.goBack(stack), { stack: ['home'], exit: false });

// Switching tabs never keeps another tab's sub-screens underneath.
stack = nav.openScreen(['followups', 'paymentHistory'], 'transactions');
assert.deepEqual(stack, ['transactions']);

// A filtered drill-down from a report is a sub-screen: back returns to the report.
stack = nav.openScreen(['planning', 'reports'], 'transactionsContext');
assert.deepEqual(stack, ['planning', 'reports', 'transactionsContext']);
assert.deepEqual(nav.goBack(stack).stack, ['planning', 'reports']);

// A legacy root key opened as a destination lands on its new root.
assert.deepEqual(nav.openScreen(['planning', 'reports'], 'trackers'), ['followups']);

// The + button is Home-only.
assert.equal(nav.showsFab(['home']), true);
assert.equal(nav.showsFab(['home', 'settings']), false);
assert.equal(nav.showsFab(['followups']), false);

// ---- typography -------------------------------------------------------------
const type = load('src/ui/typography.js');
assert.equal(type.DEFAULT_FONT_ID, 'IBM Plex Sans Arabic', 'approved default font');
assert.equal(type.fontFamilyFor('IBM Plex Sans Arabic', 400), 'MF-IBMPlexSansArabic-400');
assert.equal(type.fontFamilyFor('IBM Plex Sans Arabic', '600'), 'MF-IBMPlexSansArabic-600');
assert.equal(type.fontFamilyFor('IBM Plex Sans Arabic', '900'), 'MF-IBMPlexSansArabic-700', 'heavier than bundled -> Bold');
assert.equal(type.fontFamilyFor('IBM Plex Sans Arabic', 'bold'), 'MF-IBMPlexSansArabic-700');
assert.equal(type.fontFamilyFor('IBM Plex Sans Arabic', 450), 'MF-IBMPlexSansArabic-500', 'ties resolve heavier');
// A font without bundled files falls back to the default instead of a missing family.
assert.equal(type.fontFamilyFor('Tajawal', 600), 'MF-IBMPlexSansArabic-600');
assert.equal(type.fontFamilyFor('Cairo', 700), 'MF-IBMPlexSansArabic-700');
assert.equal(type.isSelectableFont('Tajawal'), false);
// Only the default font's faces block startup; every registered family is one
// the lookup can return.
const registered = Object.keys(type.fontAssets).sort();
assert.deepEqual(registered, [
  'MF-IBMPlexSansArabic-400',
  'MF-IBMPlexSansArabic-500',
  'MF-IBMPlexSansArabic-600',
  'MF-IBMPlexSansArabic-700',
]);
for (const w of [100, 300, 400, 500, 600, 700, 800, 900]) {
  assert(registered.includes(type.fontFamilyFor('IBM Plex Sans Arabic', w)), `weight ${w} resolves to a registered family`);
}
// The six options from tools.html, stored by their Google Fonts family names.
assert.deepEqual(type.FONT_OPTIONS.map((o) => [o.id, o.labelAr]), [
  ['IBM Plex Sans Arabic', 'الواضح'],
  ['Readex Pro', 'المرن'],
  ['Cairo', 'الكلاسيكي'],
  ['Noto Sans Arabic', 'الشامل'],
  ['Tajawal', 'الأنيق'],
  ['Almarai', 'الجريء'],
]);
assert.equal(type.clampFontScale('x'), 1);
assert.equal(type.clampFontScale(9), type.FONT_SCALE_MAX);
assert.equal(type.clampFontScale(0.1), type.FONT_SCALE_MIN);
assert.equal(type.clampFontScale(1.15), 1.15);

// ---- palette / legacy theme -------------------------------------------------
const { PALETTE } = load('src/ui/palette.js');
const { TH, BRAND_GREEN, INCOME_GREEN } = load('src/lib/theme.js');
assert.deepEqual(Object.keys(PALETTE.light).sort(), Object.keys(PALETTE.dark).sort(), 'light and dark define the same roles');
for (const mode of ['light', 'dark']) {
  for (const [key, value] of Object.entries(TH[mode])) {
    assert(typeof value === 'string' && value.length > 0, `TH.${mode}.${key} resolves to a value`);
  }
}
// Approved semantic values (colors.html / mf.css .screen.dark).
assert.equal(TH.light.primary, '#0A5C4C');
assert.equal(TH.light.inc, '#2E7D32');
assert.equal(TH.light.exp, '#B0342A');
assert.equal(TH.light.warn, '#9A6209');
assert.equal(TH.dark.primary, '#2E9B7E');
assert.equal(TH.dark.inc, '#4CAF6A');
assert.equal(TH.dark.exp, '#E8776B');
assert.equal(TH.dark.warn, '#D9A03C');
// Brand and income are independent roles now, not an alias.
assert.notEqual(BRAND_GREEN, INCOME_GREEN);
// Dark elevation: the embedded surface is lighter than the card.
assert.equal(TH.dark.card, '#1A201E');
assert.equal(TH.dark.soft, '#212B27');

console.log('redesign foundation: navigation, typography and palette contracts pass');
