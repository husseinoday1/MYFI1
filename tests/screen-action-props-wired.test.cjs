// A screen that declares an action prop with a no-op default must actually be given
// one where it is rendered.
//
// HistoryScreen and ReportsScreen both declare
// `onAddExpense = () => {}, onAddIncome = () => {}`, and App.js rendered them as bare
// `<HistoryScreen />` and `<ReportsScreen />`. So the +/- buttons on their empty states
// did nothing at all: a user with no transactions taps the one obvious call to action
// and the app does not respond. Nothing crashes, nothing logs, and the defaults make it
// invisible to every check we had.
//
// That is the shape this guards. A no-op default is convenient and it silently converts
// "I forgot to pass this" into "the button is decorative".

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');

// Screens whose empty-state actions are the user's only route to creating anything.
const SCREENS = ['HistoryScreen', 'ReportsScreen', 'HomeScreen'];
const ACTIONS = ['onAddExpense', 'onAddIncome'];

const problems = [];

for (const screen of SCREENS) {
  const file = path.join(root, 'src/screens', `${screen}.js`);
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file, 'utf8');

  for (const action of ACTIONS) {
    // Only care when the screen declares the prop at all.
    if (!new RegExp(`\\b${action}\\b`).test(source)) continue;

    // Find how App.js renders it: either `<Screen />` or `<Screen ...props />`.
    const selfClosing = new RegExp(`<${screen}\\s*/>`).test(app);
    if (selfClosing) {
      problems.push(`${screen} is rendered with no props at all, but declares ${action}`);
      break;
    }
    const block = app.match(new RegExp(`<${screen}[\\s\\S]{0,900}?/>`));
    if (!block) {
      problems.push(`${screen} render site not found in App.js`);
      break;
    }
    if (!block[0].includes(action)) {
      problems.push(`${screen} declares ${action} but App.js does not pass it`);
    }
  }
}

assert.deepEqual(
  problems,
  [],
  'screens declare action props that App.js never passes, so the buttons bound to them '
  + 'do nothing:\n' + problems.join('\n'),
);
console.log(`[PASS] every declared add-action on ${SCREENS.length} screens is wired at the render site`);

// The no-op defaults are what make this failure silent. Keep them documented rather
// than removed — removing them would crash instead, which is worse for a user — but
// assert the ones we know about stay covered above.
for (const screen of ['HistoryScreen', 'ReportsScreen']) {
  const file = path.join(root, 'src/screens', `${screen}.js`);
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(
    /onAddExpense\s*=\s*\(\)\s*=>\s*\{\}/.test(source),
    `${screen}: if the no-op default is removed, update this contract — the failure `
    + 'mode changes from a dead button to a crash, and both need a guard',
  );
}
console.log('[PASS] the no-op defaults that hide this failure are still accounted for');

console.log('MYFI SCREEN ACTION PROPS CONTRACT: PASS');
