// Runtime proofs for src/lib/planningPeriods.js, as required by
// docs/04_CURRENT_EVIDENCE/MAALFLOW_REDESIGN_R2_PLANNING_FINANCIAL_IMPACT_2026-09-11.md.
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

const target = path.join(__dirname, '..', 'src/lib/planningPeriods.js');
const compiled = new Module(target, module);
compiled.filename = target;
compiled.paths = Module._nodeModulePaths(path.dirname(target));
compiled._compile(babel.transformFileSync(target, {
  babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code, target);
const P = compiled.exports;

const day1 = [];
const pay25 = [{ effectivePeriod: '2000-01', startDay: 25 }];

// Day 1 is exactly the calendar month (upgrading users see identical numbers).
assert.deepEqual(P.periodRange('2026-02', day1), { key: '2026-02', startISO: '2026-02-01', endISO: '2026-02-28', startDay: 1 });
assert.deepEqual(P.periodRange('2028-02', day1).endISO, '2028-02-29', 'leap year');
assert.equal(P.periodKeyForDate('2026-12-31', day1), '2026-12');
assert.equal(P.periodKeyForDate('2027-01-01', day1), '2027-01');

// Board example: payday 25 -> "فترة أيلول · 25 آب – 24 أيلول".
assert.deepEqual(P.periodRange('2026-09', pay25), { key: '2026-09', startISO: '2026-08-25', endISO: '2026-09-24', startDay: 25 });
assert.equal(P.periodKeyForDate('2026-08-25', pay25), '2026-09');
assert.equal(P.periodKeyForDate('2026-08-24', pay25), '2026-08');
assert.equal(P.periodKeyForDate('2026-12-26', pay25), '2027-01', 'December payday belongs to January period');

// Label split: day 15 keys the start month, day 16 the next month.
assert.equal(P.periodRange('2026-03', [{ effectivePeriod: '2000-01', startDay: 15 }]).startISO, '2026-03-15');
assert.equal(P.periodRange('2026-03', [{ effectivePeriod: '2000-01', startDay: 16 }]).startISO, '2026-02-16');

// Clamping to month length, including 29-31 across February and leap years.
for (const d of [28, 29, 30, 31]) {
  const h = [{ effectivePeriod: '2000-01', startDay: d }];
  assert.equal(P.periodRange('2026-03', h).startISO, '2026-02-28', `start ${d} clamps in Feb 2026`);
  assert.equal(P.periodRange('2028-03', h).startISO, d === 28 ? '2028-02-28' : '2028-02-29', `start ${d} clamps in Feb 2028`);
}

// Tiling: for many start days and two full years, consecutive periods touch
// exactly (no gap, no overlap) and every date maps to the period containing it.
const nextDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};
for (const d of [1, 2, 14, 15, 16, 25, 28, 29, 30, 31]) {
  const h = [{ effectivePeriod: '2000-01', startDay: d }];
  let key = '2025-12';
  for (let i = 0; i < 26; i += 1) {
    const r = P.periodRange(key, h);
    const n = P.periodRange(P.shiftPeriodKey(key, 1), h);
    assert.equal(nextDay(r.endISO), n.startISO, `start ${d}: ${key} touches the next period`);
    assert.equal(P.periodKeyForDate(r.startISO, h), key);
    assert.equal(P.periodKeyForDate(r.endISO, h), key);
    key = P.shiftPeriodKey(key, 1);
  }
}

// Non-retroactive changes, applied twice in sequence.
const startedRanges = (h, keys) => keys.map(k => P.periodRange(k, h));
let history = day1;
const today1 = '2026-09-10';
const beforeFirst = startedRanges(history, ['2026-07', '2026-08', '2026-09']);
let step = P.scheduleStartDayChange(history, 25, today1);
history = step.history;
// Old Oct start is Oct 1; Oct under day 25 would start Sep 25 (inside the
// started Sep period) -> the change must wait until November.
assert.equal(step.effectivePeriod, '2026-11');
assert.deepEqual(startedRanges(history, ['2026-07', '2026-08', '2026-09']), beforeFirst, 'first change leaves started periods intact');
assert.deepEqual(P.periodRange('2026-10', history), { key: '2026-10', startISO: '2026-10-01', endISO: '2026-10-24', startDay: 1 }, 'one transitional period');
assert.deepEqual(P.periodRange('2026-11', history).startISO, '2026-10-25');

// Second change later, while day 25 is in force.
const today2 = '2027-01-05';
const current2 = P.periodKeyForDate(today2, history);
assert.equal(current2, '2027-01');
const beforeSecond = startedRanges(history, ['2026-09', '2026-10', '2026-11', '2026-12']);
const currentBefore = P.periodRange('2027-01', history);
step = P.scheduleStartDayChange(history, 1, today2);
history = step.history;
assert.deepEqual(startedRanges(history, ['2026-09', '2026-10', '2026-11', '2026-12']), beforeSecond, 'second change leaves past periods intact');
const currentAfter = P.periodRange('2027-01', history);
assert.equal(currentAfter.startISO, currentBefore.startISO, 'current period keeps its start');
assert.equal(currentAfter.startDay, currentBefore.startDay, 'current period keeps its start day');
assert(currentAfter.endISO >= currentBefore.endISO && currentAfter.endISO >= today2, 'current period never loses a day it already had');
assert.equal(step.effectivePeriod, '2027-02');
assert.deepEqual(P.periodRange('2027-02', history), { key: '2027-02', startISO: '2027-02-01', endISO: '2027-02-28', startDay: 1 });
assert.equal(P.periodRange('2027-01', history).endISO, '2027-01-31', 'current period only gains future days');

// A pending (not yet effective) change is replaced, not stacked; choosing the
// day already in force cancels it.
let pending = P.scheduleStartDayChange(day1, 25, '2026-09-10').history;
pending = P.scheduleStartDayChange(pending, 1, '2026-09-11').history;
assert.deepEqual(pending, [], 'reverting before the change takes effect leaves no history');

// Invalid input fails closed rather than guessing.
assert.throws(() => P.periodRange('2026-13', day1));
assert.equal(P.periodKeyForDate('not-a-date', day1), null);
assert.deepEqual(P.normalizeStartDayHistory([{ effectivePeriod: 'x', startDay: 3 }, null, { effectivePeriod: '2026-05', startDay: 99 }]),
  [{ effectivePeriod: '2026-05', startDay: 31 }]);

// Progress within a period.
assert.deepEqual(P.periodProgress('2026-09', '2026-09-11', pay25), { totalDays: 31, elapsedDays: 18, daysLeft: 13, elapsedFraction: 18 / 31 });

console.log('planning periods: tiling, labels, clamping and non-retroactive changes pass');
