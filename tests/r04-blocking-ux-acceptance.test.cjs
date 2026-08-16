const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const settings = read('src/screens/SettingsScreen.js');
const dateField = read('src/components/DateField.js');
const add = read('src/components/AddTransModal.js');
const trackers = read('src/screens/TrackersLabScreen.js');
const history = read('src/screens/HistoryScreen.js');
const homeCenter = read('src/components/HomeCenterModal.js');
const app = read('App.js');
const policy = read('src/lib/financialCommandPolicy.js');

// D-09 — direct Home profile -> Account/Security route.
assert(
  homeCenter.includes("onOpenSettingsPage?.('account')"),
  'D-09: Home profile must request Account/Security directly',
);
assert(
  app.includes("setSettingsOpenRequest({ page, nonce: Date.now() });")
    && app.includes("setTab('settings');"),
  'D-09: App must forward direct settings page request',
);
assert(
  settings.includes("const requestedPage = String(openRequest?.page || '').trim();")
    && settings.includes('setPage(requestedPage);')
    && app.includes("setSettingsOpenRequest({ page: 'root', nonce: Date.now() });"),
  'D-09: Settings must consume direct Account/Security request',
);

// D-10 — Connect/Sign-in modal keyboard avoidance.
const authStart = settings.indexOf('function AuthModal(');
const authEnd = settings.indexOf('\nfunction ', authStart + 1);
assert(authStart >= 0 && authEnd > authStart, 'D-10: AuthModal source block missing');
const authBlock = settings.slice(authStart, authEnd);
assert(
  authBlock.includes('<KeyboardAvoidingView')
    && authBlock.includes("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}"),
  'D-10: Settings Connect/Sign-in modal must avoid the keyboard',
);
assert(
  authBlock.includes('keyboardDismissMode="on-drag"'),
  'D-10: Auth modal must support keyboard dismissal while scrolling',
);

// D-17 — persistent financial input labels remain present.
assert(
  add.includes("<Text style={[s.fieldLabel, { color: th.sub, textAlign: align }]}>{L.amount}</Text>")
    && add.includes('<Text style={[s.selectLabel, { color: th.sub, textAlign: align }]}>{label}</Text>'),
  'D-17: Financial fields must retain persistent labels',
);

// D-18 — picker/focus handoff and financial-sheet keyboard ergonomics.
assert(
  dateField.includes('Keyboard.dismiss();')
    && dateField.includes('requestAnimationFrame(() => setOpen(true));'),
  'D-18: Date picker must dismiss the keyboard before opening',
);
assert(
  add.includes('Keyboard.dismiss();')
    && add.includes("maxHeight: '92%'")
    && add.includes('paddingBottom: 36 + Math.max(insets.bottom, 20)'),
  'D-18: Financial sheet/pickers must preserve usable keyboard space and handoff',
);

// D-19 — FX/money equation is structurally isolated into LTR token nodes.
assert(add.includes('export const FxEquation'), 'D-19: dedicated FX equation component missing');
assert(add.includes("flexDirection: 'row'") && add.includes("writingDirection: 'ltr'"), 'D-19: FX equation must use an isolated LTR row');
for (const currency of ['fromCurrency', 'toCurrency', 'trackerCurrency', 'entryCurrency']) {
  assert(add.includes(`<FxEquation fromCurrency={${currency}}`), `D-19: Missing FX component for ${currency}`);
}

// D-20 — one paid-this-month presentation only; duplicate action still opens today.
const paidMonthRefs = (trackers.match(/T\.paidMonth/g) || []).length;
assert.equal(paidMonthRefs, 2, 'D-20: Paid-this-month status must not be rendered redundantly');
assert(
  !trackers.includes('style={[s.paidNotice,'),
  'D-20: Redundant paid-this-month notice still exists',
);
assert(
  history.includes("mode: 'commitment'")
    && history.includes('commitmentId: target.commitmentId, dateISO: todayISO()'),
  'D-20: Repeat commitment payment must remain a reviewed draft for today',
);

// D-21 — financial semantic sign guard + visible income/expense tone remain aligned.
assert(
  policy.includes('financial_flow_sign_mismatch'),
  'D-21: financial sign/type semantic guard missing',
);
assert(
  add.includes("color: type === 'inc' ? th.inc : type === 'exp' ? th.exp : th.text"),
  'D-21: entry amount visual tone must track income/expense type',
);

console.log('MYFI R04 P18-001 blocking UX acceptance contract: PASSED');
