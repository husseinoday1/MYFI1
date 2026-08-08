const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const srcRoot = path.join(workspace, 'src');
const appConfig = JSON.parse(fs.readFileSync(path.join(workspace, 'app.json'), 'utf8'));
const appRoot = fs.readFileSync(path.join(workspace, 'App.js'), 'utf8');

assert.equal(
  appConfig.expo.userInterfaceStyle,
  'automatic',
  'Expo must allow the app to follow the phone color scheme',
);
assert(appRoot.includes('Review data merge'), 'Guest data transfer must warn before merging local/account data');
assert(appRoot.includes('Merge safely'), 'Guest data transfer must use an explicit safe merge action');
assert(appRoot.includes('restoreLastMergeRollback'), 'Guest data transfer must expose a rollback path after merging');
assert(appRoot.includes('merged without repetition'), 'Device sync merge notices must explain duplicate-safe merging');

const jsFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const target = path.join(dir, entry.name);
  if (entry.isDirectory()) return jsFiles(target);
  return entry.name.endsWith('.js') ? [target] : [];
});

jsFiles(srcRoot).forEach(file => {
  const source = fs.readFileSync(file, 'utf8');
  assert.equal(
    /[ØÙÂÃ]/.test(source),
    false,
    `Source contains mojibake text: ${path.relative(workspace, file)}`,
  );
  assert.equal(
    /<Ionicons\s+name=["']close(?:-outline)?["']/.test(source),
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
const walletBalanceCard = fs.readFileSync(path.join(srcRoot, 'components', 'WalletBalanceCard.js'), 'utf8');
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
assert(addModal.includes("seg.filter(sg => sg.k !== 'planning')"), 'General entry selector must keep tracker modes out of the money-entry row');
assert(addModal.includes("smartEntryAvailable ? { k: 'smart'"), 'Smart input must be an explicit top-level entry mode');
assert(addModal.includes("{smartOpen ? ("), 'Smart input panel must render only after the user enters smart mode');
assert(addModal.includes("(!smartOpen && type === sg.k)"), 'Smart entry must not visually select another transaction mode at the same time');
assert(addModal.includes("icon: 'arrow-down-outline'"), 'Expense mode must use a valid down-arrow icon');
assert(addModal.includes("icon: 'arrow-up-outline'"), 'Income mode must use a valid up-arrow icon');
assert.equal(addModal.includes('arrow-down-left'), false, 'Expense mode must not use unsupported Ionicons names');
assert.equal(addModal.includes('arrow-up-right'), false, 'Income mode must not use unsupported Ionicons names');
assert.equal(addModal.includes('{isSmartLaunch ? ('), false, 'Smart input must not render automatically for every money entry');
assert.equal(addModal.includes('smartText'), false, 'Smart input must not expose manual text entry state');
assert.equal(addModal.includes('smartLabels.text'), false, 'Smart input must only offer image and voice modes');
assert.equal(addModal.includes('smartQuotaText'), false, 'Smart input must not keep a persistent explanatory text row');
assert.equal(addModal.includes('عرض التفاصيل الإضافية'), false, 'Entry details must stay visible without a secondary reveal step');
assert(addModal.includes('dateRepeatRow'), 'Date and monthly recurrence must share a compact row');
assert(addModal.includes('repeatField'), 'Monthly recurrence must render as a symmetric field beside the date');
assert(addModal.includes('selectSheetPanel'), 'Dropdown choices must open in a floating sheet instead of expanding the entry form');
assert.equal(addModal.includes('selectOptions'), false, 'Dropdown options must not render inline under the field');
assert.equal(addModal.includes('selectedFirstOptions'), false, 'Floating pickers must keep wallet/category order stable');
assert.equal(addModal.includes('onNewTracker'), false, 'Transaction entry must not expose tracker creation');
assert.equal(addModal.includes('renderTrackerCreateAction'), false, 'Transaction entry must keep tracker creation out of money entry');
assert.equal(addModal.includes('trackerEntryPanel'), false, 'Transaction entry must not show tracker add panels');
assert(addModal.includes("{selected?.detail || ' '}"), 'Select fields must reserve a detail line so category and wallet cards stay symmetric');
assert(addModal.includes('selectField:{ minHeight: 64'), 'Wallet and category select cards must share a fixed visual height');
assert(addModal.includes('dateButton:{ minHeight: 64'), 'Date field must match the larger select card height');
assert(addModal.includes('repeatField:{ minHeight: 64'), 'Monthly repeat field must match the larger select card height');
assert(addModal.includes("id: 'tracker-wallet'"), 'Tracker payments must allow choosing a wallet instead of forcing the default');
assert(addModal.includes('const isTrackerPayment ='), 'Tracker payment wallet choice must be guarded by an explicit mode check');
assert(addModal.includes('const eligibleTransferWallets = transferWalletList;'), 'Transfer choices must include every wallet');
assert.equal(addModal.includes('walletScope(sourceWallet) !== walletScope(targetWallet)'), false, 'Transfer entry must accept cross-scope wallet pairs');
assert.equal(addModal.includes('false &&'), false, 'Transaction entry must not keep unreachable disabled JSX blocks');
assert.equal(addModal.includes('setShowMore'), false, 'Transaction entry must not keep dead More state after the compact redesign');
assert(addModal.includes("maxHeight: focusedEntry ? '76%' : '82%'"), 'Transaction modal must stay short enough for one-handed entry');
assert(addModal.includes('accessibilityState={{ checked: recurring }}'), 'Monthly recurrence must be directly available in transaction entry');
assert.equal(settings.includes("{ key: 'recurring', label:"), false, 'Monthly recurrence must remain a core entry capability, not a hideable module');
assert(newItemModal.includes("id: 'commitment-wallet'") && newItemModal.includes('label={T.planDate}\n                    monthOnly'), 'Standalone commitments must select a month instead of a day');
assert(newItemModal.includes("id: 'plan-wallet'") && newItemModal.includes('label={T.planDate}\n                      monthOnly'), 'Linked commitments must select a month instead of a day');
assert(addModal.includes('const [categoryTouched, setCategoryTouched]'), 'Manual category selection must prevent smart title matching from overriding the user');
assert(addModal.includes('suggestCategoryFromHistory(title, trans'), 'Transaction titles must suggest categories from the user ledger');
assert(addModal.includes('getCategoriesForFlow(cats, entryFlow)'), 'Transaction entry must filter categories by income or expense flow');
assert(addModal.includes('const categoryOptions = entryCategories.map(category =>'), 'Transaction categories must derive from the filtered income/expense list');
assert(addModal.includes("id: 'category'"), 'Transaction entry must expose the category as a compact dropdown');
assert(settings.includes('flow: newCatFlow'), 'New custom categories must persist their income/expense flow');
assert(settings.includes('categoryFlowLabel(cat, cfg.lang)'), 'Settings must show whether a category belongs to income, expense, or both');
assert(notificationCenter.includes('onDismissItems?.(dismissalKeys)'), 'Notification center must support dismissing individual alerts');
assert(notificationCenter.includes('dismiss(selectedKeys)'), 'Notification center must support dismissing selected alerts in bulk');
assert(notificationCenter.includes("items.map(item => String(item.id || 'notification'))"), 'Notification selection must use stable notification identities');
assert(notificationCenter.includes('notificationReadKey(item, Date.now())'), 'Notification dismissal must persist a timestamped key');
assert(walletBalanceCard.includes('available < 0'), 'Wallet cards must call out negative available balances');
assert(walletBalanceCard.includes('walletWarning'), 'Wallet cards must render a warning state for overspent wallets');

const history = fs.readFileSync(path.join(srcRoot, 'screens', 'HistoryScreen.js'), 'utf8');
const reports = fs.readFileSync(path.join(srcRoot, 'screens', 'ReportsScreen.js'), 'utf8');
const trackers = fs.readFileSync(path.join(srcRoot, 'screens', 'TrackersLabScreen.js'), 'utf8');
const home = fs.readFileSync(path.join(srcRoot, 'screens', 'HomeScreen.js'), 'utf8');
assert.equal(/<TextInpu\b/.test(history), false, 'History must use the imported TextInput component');
assert.equal(/<SectionLis\b/.test(history), false, 'History must use the imported SectionList component');
assert(history.includes('onPress={applyDraft}'), 'History filters must have an explicit apply action');
assert(history.includes('const [draftFilters, setDraftFilters]'), 'History filters must be staged before applying');
assert(history.includes("sheet: { maxHeight: '76%'"), 'History filter sheet must stay compact and reachable with one hand');
assert.equal(history.includes('quickFilterChip'), false, 'History must not show the crowded quick-filter strip');
assert.equal(history.includes('tagBadge'), false, 'History rows must not show transaction tags as separate badges');
assert.equal(history.includes('amountRange'), false, 'History filter sheet must stay compact');
assert.equal(history.includes('searchableTransactionTags'), false, 'Transaction tags must remain searchable metadata, not a separate crowded filter');
assert(reports.indexOf('const financialReport =') < reports.indexOf('const stats ='), 'Reports must create the shared report model before reading its stats');
assert(reports.includes('periodCard: { minHeight: 78'), 'Reports period selector must stay compact at the top of the screen');
assert(reports.includes('shareCenterBtn: { width: 58'), 'Reports share action must not create a tall top row');
assert(trackers.includes('const paidThisMonth ='), 'Commitment cards must derive whether the current month was paid');
assert(trackers.includes('{T.paidMonth}'), 'Commitment cards must show the current-month payment message');
assert(trackers.includes('T.completionRetention'), 'Completed trackers must explain the seven-day review period');
assert(trackers.includes("item.status === 'done' && !item.ended"), 'Completed trackers must show the retention notice before archive');
assert(trackers.includes('filterMenuOpen'), 'Trackers must use a compact dropdown filter instead of a crowded chip rail');
assert(trackers.includes('screenHeader'), 'Trackers must have the shared screen header and add action');
assert(trackers.includes('trackerQuickEntry'), 'Trackers must show a Home-style add panel');
assert(trackers.includes('onPress={onNewTracker}'), 'Trackers quick add card must open tracker creation');
assert.equal(trackers.includes('trackerType: action.key'), false, 'Trackers quick add must expose one add path, not multiple type-specific add buttons');
assert.equal(trackers.includes('headerAddBtn'), false, 'Trackers must not keep the add button in the top header');
assert.equal(trackers.includes('quickTrackerEntry'), false, 'Trackers add panel must not disappear in classic entry mode');
assert.equal(trackers.includes("sort((a, b) => (a.id === openId"), false, 'Opening a tracker card must not move it to the top');
assert(trackers.includes('expandedPaymentHistoryId'), 'Tracker payment history must stay hidden behind an explicit reveal state');
assert(trackers.includes('historyToggle'), 'Tracker payment history must use a reveal button instead of opening automatically');
assert(trackers.includes('accessibilityState={{ expanded: historyOpen }}'), 'Tracker payment history reveal must expose expanded state');
assert.equal(trackers.includes('+ إدخال سريع'), false, 'Trackers screen must not expose financial-entry quick buttons');
assert.equal(trackers.includes('+ إدخال كامل'), false, 'Trackers screen must not expose financial-entry full buttons');
assert.equal(trackers.includes('onQuickEntry'), false, 'Trackers must keep financial entry actions out of tracker creation');
assert.equal(trackers.includes('trackerAddPanel'), false, 'Trackers must not show a second add panel under the header');
assert.equal(trackers.includes('quickEntry'), false, 'Trackers must not receive money-entry mode props');
assert(appRoot.includes("classicEntry && tab === 'home'"), 'Classic floating money entry must stay off the trackers tab');
assert.equal(/<AddTransModal[\s\S]*?onNewTracker=\{openNewTracker\}/.test(appRoot), false, 'Transaction modal must not open tracker creation from money entry');
assert.equal(appRoot.includes("['home', 'trackers']"), false, 'Trackers must not share the general floating entry button');
assert(newItemModal.includes('headerIconBtn'), 'Tracker creation modal must use the refreshed compact header');
assert(newItemModal.includes('active ? option.color : th.cardHigh'), 'Tracker creation modal must make the selected mode visually decisive');
assert(newItemModal.includes('selectSheetPanel'), 'Tracker creation choices must use the floating picker design');
assert(newItemModal.includes("typeBtn: { width: '48.5%'"), 'Tracker creation type cards must be symmetric instead of squeezed into one row');
assert(newItemModal.includes('requestedTrackerType'), 'Tracker creation must honor the tracker type selected from quick actions');
assert(newItemModal.includes('selectField: { minHeight: 64'), 'Tracker creation select cards must match the larger dropdown field size');
assert.equal(newItemModal.includes('selectedFirstOptions'), false, 'Tracker creation wallet choices must keep their stable order');
assert.equal(newItemModal.includes('walletChip'), false, 'Tracker creation must not keep the old horizontal wallet chip rail');
assert(newItemModal.includes("id: 'plan-wallet'"), 'Linked monthly commitments must use the redesigned wallet picker');
assert(newItemModal.includes("id: 'commitment-wallet'"), 'Standalone commitments must use the redesigned wallet picker');
assert(notificationCenter.includes('policyStrip'), 'Notification center must explain automatic dismissal retention');
assert(notificationCenter.includes('dismiss(itemKeys)'), 'Notification center must allow dismissing all visible alerts');
assert(home.includes('attentionHeader'), 'Important states must use the shared attention header');
assert(home.includes('expandedRecentId'), 'Home transactions must expose inline expandable details');
assert(home.includes('detailsToggle'), 'Home transaction rows must use a down-arrow details toggle');
assert(home.includes('inlineDetails'), 'Home transaction details must appear in place');
assert(home.includes("icon: 'arrow-down-outline', color: th.exp"), 'Home expense quick action must use the down arrow');
assert(home.includes("icon: 'arrow-up-outline', color: th.inc"), 'Home income quick action must use the up arrow');
assert.equal(home.includes('payCommitment(item.id'), false, 'Home commitment actions must open the wallet-aware payment modal');
assert(home.includes('onQuickCommitment(item.id)'), 'Home commitment actions must route through the wallet-aware payment modal');
assert(home.includes('item.actionable'), 'Home must include actionable commitments in important states');
assert(home.includes("item.key === 'attention' && attentionItems.length > 0"), 'Due commitments must force important states onto Home');

console.log('MYFI modal and settings UI contract: all assertions passed');
