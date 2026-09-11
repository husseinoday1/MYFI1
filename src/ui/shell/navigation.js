// Navigation rules for the redesigned shell (glossary.html, "التنقل والبنية").
// Pure functions only — no React Native imports — so the rules are unit-tested
// in tests/redesign-navigation.test.cjs.
//
//  - Four tab roots: Home · Follow-ups · Transactions · Planning. No swiping
//    between tabs.
//  - System back from any tab root returns to Home; from Home it leaves the app.
//  - Sub-screens go back to the screen they were opened from.
//  - The + button exists on Home only and means "new transaction".

export const ROOT_TABS = [
  { key: 'home', icon: 'home', labelAr: 'الرئيسية', labelEn: 'Home' },
  { key: 'followups', icon: 'checklist', labelAr: 'المتابعات', labelEn: 'Follow-ups' },
  { key: 'transactions', icon: 'arrows-exchange', labelAr: 'الحركات', labelEn: 'Transactions' },
  { key: 'planning', icon: 'chart-pie', labelAr: 'التخطيط', labelEn: 'Planning' },
];

export const ROOT_TAB_KEYS = ROOT_TABS.map((tab) => tab.key);

// Destinations from before the redesign. Every stored or emitted key keeps
// working: a legacy root maps to its new root, and a legacy destination that
// became a tab root resolves to that root.
export const LEGACY_TAB_ALIASES = {
  trackers: 'followups',
  history: 'transactions',
  mymoney: 'planning',
  more: 'home',
};

export const resolveTabKey = (key) => LEGACY_TAB_ALIASES[key] || key || 'home';

export const isRootTab = (key) => ROOT_TAB_KEYS.includes(resolveTabKey(key));

// The persisted start tab (cfg.startTab) accepts only a current root.
const LEGACY_START_TAB = {
  history: 'transactions',
  reports: 'planning',
  settings: 'home',
  mymoney: 'planning',
  trackers: 'followups',
  more: 'home',
};

export function normalizeStartTab(value, fallback = 'home') {
  const mapped = LEGACY_START_TAB[value] || value;
  return ROOT_TAB_KEYS.includes(mapped) ? mapped : fallback;
}

// The shell keeps a stack whose first entry is always a tab root.
//   open(key):  a root replaces the stack; a sub-screen is pushed (re-opening
//               the screen already on top is a no-op, not a duplicate entry).
//   back():     pops a sub-screen; from a non-Home root goes to Home; from Home
//               returns the stack unchanged with `exit: true` so the caller
//               lets the OS handle the press.
export const initialStack = (root = 'home') => [normalizeStartTab(root)];

export function openScreen(stack, key) {
  const target = resolveTabKey(key);
  if (isRootTab(target)) return [target];
  const base = stack && stack.length ? stack : initialStack();
  if (base[base.length - 1] === target) return base;
  return [...base, target];
}

export function goBack(stack) {
  const base = stack && stack.length ? stack : initialStack();
  if (base.length > 1) return { stack: base.slice(0, -1), exit: false };
  if (base[0] !== 'home') return { stack: ['home'], exit: false };
  return { stack: base, exit: true };
}

export const currentScreen = (stack) => (stack && stack.length ? stack[stack.length - 1] : 'home');
export const currentRoot = (stack) => (stack && stack.length ? stack[0] : 'home');

export const showsFab = (stack) => currentScreen(stack) === 'home';
