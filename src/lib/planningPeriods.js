// Financial periods for planning (planning.html, "الفترة").
//
// A period is the plan's month. It starts on day 1 or on payday and keeps a
// `YYYY-MM` key, so budget storage and its key format are unchanged.
// Rules (docs/04_CURRENT_EVIDENCE/MAALFLOW_REDESIGN_R2_PLANNING_FINANCIAL_IMPACT_2026-09-11.md §2):
//  - A period that starts on day d of month M is keyed M when d <= 15, else M+1
//    (the month holding most of its days). With d = 1 every period equals its
//    calendar month, so upgrading users see identical boundaries.
//  - The start day is clamped to the month's length.
//  - A period ends the day before the next period starts: periods tile the
//    timeline with no gap and no overlap.
//  - Start-day changes are never retroactive: they are stored as
//    `startDayHistory` entries effective from a future period only.
// Pure date arithmetic on ISO calendar dates (YYYY-MM-DD); no clock, no
// timezone, no Date parsing of local strings.

const KEY_RE = /^(\d{4})-(\d{2})$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;

export const MIN_START_DAY = 1;
export const MAX_START_DAY = 31;
export const LABEL_SPLIT_DAY = 15;

const pad = (n) => String(n).padStart(2, '0');

const daysInMonth = (year, month1) => new Date(Date.UTC(year, month1, 0)).getUTCDate();

export const normalizeStartDay = (value) => {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return MIN_START_DAY;
  return Math.min(MAX_START_DAY, Math.max(MIN_START_DAY, n));
};

export const parsePeriodKey = (key) => {
  const match = KEY_RE.exec(String(key || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
};

export const isPeriodKey = (key) => parsePeriodKey(key) !== null;

export const shiftPeriodKey = (key, delta) => {
  const parsed = parsePeriodKey(key);
  if (!parsed) throw new Error(`invalid period key: ${key}`);
  const index = parsed.year * 12 + (parsed.month - 1) + Math.trunc(delta);
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
};

export const comparePeriodKeys = (a, b) => (a === b ? 0 : (a < b ? -1 : 1));

const parseISO = (iso) => {
  const match = ISO_RE.exec(String(iso || ''));
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
};

const toISO = ({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`;

const addDaysISO = (iso, delta) => {
  const p = parseISO(iso);
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day + delta));
  return toISO({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
};

// History entries: [{ effectivePeriod: 'YYYY-MM', startDay }]. Invalid entries
// are dropped, not repaired into guesses; duplicates keep the latest listed.
export const normalizeStartDayHistory = (history) => {
  const byPeriod = new Map();
  for (const entry of Array.isArray(history) ? history : []) {
    if (!entry || !isPeriodKey(entry.effectivePeriod)) continue;
    byPeriod.set(entry.effectivePeriod, normalizeStartDay(entry.startDay));
  }
  return [...byPeriod.entries()]
    .sort(([a], [b]) => comparePeriodKeys(a, b))
    .map(([effectivePeriod, startDay]) => ({ effectivePeriod, startDay }));
};

export const startDayForPeriod = (key, history) => {
  let day = MIN_START_DAY;
  for (const entry of normalizeStartDayHistory(history)) {
    if (comparePeriodKeys(entry.effectivePeriod, key) <= 0) day = entry.startDay;
    else break;
  }
  return day;
};

// Start date of period `key` under a given start day, ignoring history.
const startUnderDay = (key, startDay) => {
  const day = normalizeStartDay(startDay);
  const base = day <= LABEL_SPLIT_DAY ? key : shiftPeriodKey(key, -1);
  const { year, month } = parsePeriodKey(base);
  return toISO({ year, month, day: Math.min(day, daysInMonth(year, month)) });
};

export const periodStartISO = (key, history) => startUnderDay(key, startDayForPeriod(key, history));

export function periodRange(key, history) {
  if (!isPeriodKey(key)) throw new Error(`invalid period key: ${key}`);
  const startISO = periodStartISO(key, history);
  const nextStart = periodStartISO(shiftPeriodKey(key, 1), history);
  const endISO = addDaysISO(nextStart, -1);
  // Fail closed: a history that would make periods overlap or vanish is a bug
  // upstream (scheduleStartDayChange never produces one), not something to patch.
  if (endISO < startISO) throw new Error(`period ${key} has no days under the given start-day history`);
  return { key, startISO, endISO, startDay: startDayForPeriod(key, history) };
}

export function periodKeyForDate(dateISO, history) {
  const p = parseISO(dateISO);
  if (!p) return null;
  const iso = toISO(p);
  const calendarKey = `${p.year}-${pad(p.month)}`;
  for (const delta of [0, 1, -1]) {
    const key = shiftPeriodKey(calendarKey, delta);
    const range = periodRange(key, history);
    if (range.startISO <= iso && iso <= range.endISO) return key;
  }
  return null;
}

export const isDateInPeriod = (dateISO, key, history) => {
  const p = parseISO(dateISO);
  if (!p) return false;
  const iso = toISO(p);
  const range = periodRange(key, history);
  return range.startISO <= iso && iso <= range.endISO;
};

// A transition this long or longer is surfaced to the caller (see below) so a
// screen can warn the user before applying it, rather than silently producing
// an oversized period.
export const LONG_TRANSITION_WARNING_DAYS = 45;

// Schedule a start-day change as of `todayISO` without touching any period that
// has started: the change takes effect at the first future period whose new
// start is on or after the day the current period would otherwise end + 1.
// The current period may therefore be followed by one transitional period, but
// no date that already belongs to a started period moves.
//
// When the new day falls on the other side of the label split (day <= 15 vs.
// > 15) from the old one, "the first valid new-day occurrence on or after the
// old end" can itself be a full period later — e.g. moving from day 16 to day
// 15 near a period boundary makes the *only* correctly-tiling, non-retroactive
// candidate the occurrence a month after that. This is not a search bug: any
// key-based period system that (a) never reinterprets a date already inside a
// started period, (b) tiles with no gap, and (c) keeps `YYYY-MM` period keys
// compatible with existing budget storage, produces the same result for this
// input — shrinking the current period instead just moves the same excess days
// onto whichever period absorbs the transition. So this function does not try
// to eliminate a long transition; it reports one via `warning` /
// `currentPeriodDays` so a screen can tell the user before applying the change,
// instead of a silent surprise later. See docs/04_CURRENT_EVIDENCE/
// MAALFLOW_REDESIGN_R2_PLANNING_FINANCIAL_IMPACT_2026-09-11.md §2.
export function scheduleStartDayChange(history, newStartDay, todayISO) {
  const normalized = normalizeStartDayHistory(history);
  const day = normalizeStartDay(newStartDay);
  const currentKey = periodKeyForDate(todayISO, normalized);
  if (!currentKey) throw new Error(`invalid date: ${todayISO}`);
  // Drop entries scheduled after the current period: a newer choice replaces a
  // pending one that has not taken effect yet.
  const kept = normalized.filter(entry => comparePeriodKeys(entry.effectivePeriod, currentKey) <= 0);
  if (startDayForPeriod(shiftPeriodKey(currentKey, 1), kept) === day
      && startDayForPeriod(currentKey, kept) === day) {
    return { history: kept, effectivePeriod: null, currentPeriodDays: null, warning: null };
  }
  const oldNextStart = periodStartISO(shiftPeriodKey(currentKey, 1), kept);
  let candidate = shiftPeriodKey(currentKey, 1);
  while (startUnderDay(candidate, day) < oldNextStart) candidate = shiftPeriodKey(candidate, 1);
  const next = normalizeStartDayHistory([...kept, { effectivePeriod: candidate, startDay: day }]);
  const extendedRange = periodRange(currentKey, next);
  const currentPeriodDays = (Date.parse(`${extendedRange.endISO}T00:00:00Z`) - Date.parse(`${extendedRange.startISO}T00:00:00Z`)) / 86400000 + 1;
  return {
    history: next,
    effectivePeriod: candidate,
    currentPeriodDays,
    warning: currentPeriodDays >= LONG_TRANSITION_WARNING_DAYS ? 'extended_current_period' : null,
  };
}

// Whole days left in a period after `todayISO` (today excluded), and elapsed
// fraction for pace comparisons. Both are pure functions of the range.
export function periodProgress(key, todayISO, history) {
  const { startISO, endISO } = periodRange(key, history);
  const dayNumber = (iso) => {
    const p = parseISO(iso);
    return Date.UTC(p.year, p.month - 1, p.day) / 86400000;
  };
  const total = dayNumber(endISO) - dayNumber(startISO) + 1;
  const today = Math.min(Math.max(dayNumber(toISO(parseISO(todayISO))), dayNumber(startISO) - 1), dayNumber(endISO));
  const elapsedDays = Math.max(0, today - dayNumber(startISO) + 1);
  return {
    totalDays: total,
    elapsedDays,
    daysLeft: total - elapsedDays,
    elapsedFraction: total > 0 ? elapsedDays / total : 0,
  };
}
