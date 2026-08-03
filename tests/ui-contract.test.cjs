const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const srcRoot = path.join(workspace, 'src');
const appConfig = JSON.parse(fs.readFileSync(path.join(workspace, 'app.json'), 'utf8'));

assert.equal(
  appConfig.expo.userInterfaceStyle,
  'automatic',
  'Expo must allow the app to follow the phone color scheme',
);

const jsFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const target = path.join(dir, entry.name);
  if (entry.isDirectory()) return jsFiles(target);
  return entry.name.endsWith('.js') ? [target] : [];
});

jsFiles(srcRoot).forEach(file => {
  const source = fs.readFileSync(file, 'utf8');
  assert.equal(
    /<Ionicons\s+name=["']close(?:-[^"']*)?["']/.test(source),
    false,
    `Dismiss X icon is not allowed: ${path.relative(workspace, file)}`,
  );
});

const settings = fs.readFileSync(path.join(srcRoot, 'screens', 'SettingsScreen.js'), 'utf8');
assert.equal(settings.includes('identityPanel'), false, 'Duplicate account identity panel must stay out of settings');
assert.equal(settings.includes('statusPanel'), false, 'Account/data/security summary panel must stay out of settings');
['forecastAlert', 'budgetAlert', 'recurringAlert', 'unusualSpendAlert', 'goalProgressAlert'].forEach(key => {
  assert.equal(settings.includes(`label={T.${key}}`), false, `Report insights must not be exposed as notification switches: ${key}`);
});

const addModal = fs.readFileSync(path.join(srcRoot, 'components', 'AddTransModal.js'), 'utf8');
const newItemModal = fs.readFileSync(path.join(srcRoot, 'components', 'NewItemModal.js'), 'utf8');
const notificationCenter = fs.readFileSync(path.join(srcRoot, 'components', 'NotificationCenterModal.js'), 'utf8');
assert(addModal.includes('style={StyleSheet.absoluteFill} onPress={handleClose}'), 'Transaction modal must dismiss from an independent backdrop');
assert(newItemModal.includes('style={StyleSheet.absoluteFill} onPress={handleClose}'), 'Tracker modal must dismiss from an independent backdrop');
jsFiles(srcRoot).forEach(file => {
  const source = fs.readFileSync(file, 'utf8');
  assert.equal(
    source.includes('event.stopPropagation()'),
    false,
    `Modal sheets must not block scroll gestures with stopPropagation: ${path.relative(workspace, file)}`,
  );
});
assert.equal(addModal.includes('tagHeading'), false, 'Transaction tag/search metadata must not be shown as a manual entry field');
assert.equal(addModal.includes('transactionTagChip'), false, 'Transaction tag chips must not crowd the add transaction modal');
assert(addModal.includes("seg.filter(sg => sg.k !== 'planning')"), 'General add transaction type selector must only expose expense, income, and eligible transfer');
assert(addModal.includes('const eligibleTransferWallets = transferWalletList;'), 'Transfer choices must include every wallet');
assert.equal(addModal.includes('walletScope(sourceWallet) !== walletScope(targetWallet)'), false, 'Transfer entry must accept cross-scope wallet pairs');
assert(addModal.includes('const [showMore, setShowMore]'), 'Optional transaction details must stay collapsed until the user opens More');
assert(addModal.includes('const [categoryTouched, setCategoryTouched]'), 'Manual category selection must prevent smart title matching from overriding the user');
assert(addModal.includes('suggestCategoryFromHistory(title, trans'), 'Transaction titles must suggest categories from the user ledger');
assert(notificationCenter.includes('onDismissItems?.(safe)'), 'Notification center must support dismissing individual alerts');
assert(notificationCenter.includes('dismiss(selectedKeys)'), 'Notification center must support dismissing selected alerts in bulk');

const history = fs.readFileSync(path.join(srcRoot, 'screens', 'HistoryScreen.js'), 'utf8');
assert(history.includes('onPress={applyDraft}'), 'History filters must have an explicit apply action');
assert(history.includes('const [draftFilters, setDraftFilters]'), 'History filters must be staged before applying');
assert.equal(history.includes('quickFilterChip'), false, 'History must not show the crowded quick-filter strip');
assert.equal(history.includes('tagBadge'), false, 'History rows must not show transaction tags as separate badges');
assert.equal(history.includes('amountRange'), false, 'History filter sheet must stay compact');
assert.equal(history.includes('searchableTransactionTags'), false, 'Transaction tags must remain searchable metadata, not a separate crowded filter');

console.log('MYFI modal and settings UI contract: all assertions passed');
