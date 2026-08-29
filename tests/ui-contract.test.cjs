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
assert(appRoot.includes('mergeRollbackPromptTimer') && appRoot.includes('setTimeout') && appRoot.includes('30000'), 'Guest merge rollback prompt must be delayed so users can review merged data first');
assert(appRoot.includes('merged without repetition'), 'Device sync merge notices must explain duplicate-safe merging');
assert(appRoot.includes('BackHandler.addEventListener') && appRoot.includes('hardwareBackPress') && appRoot.includes('setArchiveOpen(false)'), 'Android back must close the archive view instead of exiting the app');

const jsFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const target = path.join(dir, entry.name);
  if (entry.isDirectory()) return jsFiles(target);
  return entry.name.endsWith('.js') ? [target] : [];
});

jsFiles(srcRoot).forEach(file => {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(workspace, file);
  assert.equal(
    /[ØÙÂÃ]/.test(source),
    false,
    `Source contains mojibake text: ${path.relative(workspace, file)}`,
  );
  if (relative !== path.join('src', 'components', 'DecisionModal.js')) {
    assert.equal(
      /<Ionicons\s+name=["']close(?:-outline)?["']/.test(source),
      false,
      `Dismiss X icon is reserved for explicit cancel/close actions: ${relative}`,
    );
  }
});

const settings = fs.readFileSync(path.join(srcRoot, 'screens', 'SettingsScreen.js'), 'utf8');
const legacySettings = fs.readFileSync(path.join(srcRoot, 'screens', 'SettingsLegacyScreen.js'), 'utf8');
assert.equal(settings.includes('identityPanel'), false, 'Duplicate account identity panel must stay out of settings');
assert.equal(settings.includes('statusPanel'), false, 'Account/data/security summary panel must stay out of settings');
assert(settings.includes('function RootSettings') && settings.includes('function AccountPage'), 'Settings must separate the index from the Account detail screen');
assert(settings.includes('function DevicesPage') && settings.includes('function DataPage') && settings.includes('function SecurityPage'), 'Devices, Data & Storage, and Security must be dedicated settings pages');
assert(settings.includes('MenuGroup') && settings.includes('MenuRow'), 'Settings must use grouped list navigation instead of dense all-in-one cards');
assert(settings.includes("supabase.auth.signOut({ scope: 'local' })"), 'Sign out must remain local to the current device');
assert(settings.includes("supabase.auth.signOut({ scope: 'others' })"), 'Devices must support revoking other cloud sessions');
assert.equal(settings.includes('checkSupabaseHealth'), false, 'Account sign-in and password recovery must not be blocked by a preflight health gate');
['forecastAlert', 'budgetAlert', 'recurringAlert', 'unusualSpendAlert', 'goalProgressAlert'].forEach(key => {
  assert.equal(settings.includes(`label={T.${key}}`), false, `Report insights must not be exposed as notification switches: ${key}`);
});

const addModal = fs.readFileSync(path.join(srcRoot, 'components', 'AddTransModal.js'), 'utf8');
const newItemModal = fs.readFileSync(path.join(srcRoot, 'components', 'NewItemModal.js'), 'utf8').replace(/\r\n?/g, '\n');
const notificationCenter = fs.readFileSync(path.join(srcRoot, 'components', 'NotificationCenterModal.js'), 'utf8');
const walletBalanceCard = fs.readFileSync(path.join(srcRoot, 'components', 'WalletBalanceCard.js'), 'utf8');
const homeCenter = fs.readFileSync(path.join(srcRoot, 'components', 'HomeCenterModal.js'), 'utf8');
const appPrimitives = fs.readFileSync(path.join(srcRoot, 'components', 'AppPrimitives.js'), 'utf8');
const accountDelete = fs.readFileSync(path.join(srcRoot, 'components', 'AccountDeleteModal.js'), 'utf8');
const passwordRecovery = fs.readFileSync(path.join(srcRoot, 'components', 'PasswordRecoveryModal.js'), 'utf8');
const archive = fs.readFileSync(path.join(srcRoot, 'screens', 'ArchiveScreen.js'), 'utf8');
const auth = fs.readFileSync(path.join(srcRoot, 'screens', 'AuthScreen.js'), 'utf8');
const theme = fs.readFileSync(path.join(srcRoot, 'lib', 'theme.js'), 'utf8');
const startupTiming = fs.readFileSync(path.join(srcRoot, 'lib', 'startupTiming.js'), 'utf8');
const demoData = fs.readFileSync(path.join(srcRoot, 'store', 'demoData.js'), 'utf8');
const monthsLib = fs.readFileSync(path.join(srcRoot, 'lib', 'months.js'), 'utf8');
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
assert(addModal.includes("direction: 'expense', tone: th.exp"), 'Expense mode must use the red minus direction mark');
assert(addModal.includes("direction: 'income', tone: th.inc"), 'Income mode must use the green plus direction mark');
assert.equal(addModal.includes('arrow-down-left'), false, 'Expense mode must not use unsupported Ionicons names');
assert.equal(addModal.includes('arrow-up-right'), false, 'Income mode must not use unsupported Ionicons names');
assert.equal(addModal.includes('{isSmartLaunch ? ('), false, 'Smart input must not render automatically for every money entry');
assert.equal(addModal.includes('smartText'), false, 'Smart input must not expose manual text entry state');
assert.equal(addModal.includes('smartLabels.text'), false, 'Smart input must only offer image and voice modes');
assert.equal(addModal.includes('smartQuotaText'), false, 'Smart input must not keep a persistent explanatory text row');
assert(addModal.includes("key: 'camera'"), 'Smart input must expose camera as a direct action');
assert(addModal.includes("key: 'image'"), 'Smart input must expose gallery image as a direct action');
assert(addModal.includes('smartActionGrid'), 'Smart input actions must be arranged as labeled cards, not centered icon-only buttons');
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
assert(/selectField\s*:\s*\{\s*minHeight:\s*64,\s*height:\s*64/.test(addModal), 'Wallet and category select cards must share an exact fixed visual height');
assert(/dateButton\s*:\s*\{\s*minHeight:\s*64,\s*height:\s*64/.test(addModal), 'Date field must match the select card exact height');
assert(/repeatField\s*:\s*\{\s*minHeight:\s*64,\s*height:\s*64/.test(addModal), 'Monthly repeat field must match the select card exact height');
assert(addModal.includes('labelInside'), 'Date fields in the transaction modal must keep labels inside matching field cards');
assert.equal(addModal.includes('`${categoryFlowHint} ·'), false, 'Category select details must not repeat the income/expense category label below the selected category');
assert.equal(/detail:\s*categoryFlowHint/.test(addModal), false, 'Category select details must not duplicate the field label under every category');
assert(addModal.includes("id: 'tracker-wallet'"), 'Tracker payments must allow choosing a wallet instead of forcing the default');
assert(addModal.includes('const isTrackerPayment ='), 'Tracker payment wallet choice must be guarded by an explicit mode check');
assert(addModal.includes('const eligibleTransferWallets = transferWalletList;'), 'Transfer choices must include every wallet');
assert.equal(addModal.includes('walletScope(sourceWallet) !== walletScope(targetWallet)'), false, 'Transfer entry must accept cross-scope wallet pairs');
assert.equal(addModal.includes('false &&'), false, 'Transaction entry must not keep unreachable disabled JSX blocks');
assert.equal(addModal.includes('setShowMore'), false, 'Transaction entry must not keep dead More state after the compact redesign');
assert(addModal.includes("maxHeight: '92%'"), 'Transaction modal must provide sufficient keyboard-safe vertical space for financial entry');
assert(addModal.includes('accessibilityState={{ checked: recurring }}'), 'Monthly recurrence must be directly available in transaction entry');
assert.equal(settings.includes("{ key: 'recurring', label:"), false, 'Monthly recurrence must remain a core entry capability, not a hideable module');
assert(newItemModal.includes("id: 'commitment-wallet'") && newItemModal.includes("planDate: ar ? 'تاريخ الدفع' : 'Payment date'"), 'Standalone commitments must select an exact payment date');
assert(newItemModal.includes("id: 'plan-wallet'") && newItemModal.includes('firstDueISO: planDate'), 'Linked commitments must preserve the exact selected payment date');
assert(addModal.includes('const [categoryTouched, setCategoryTouched]'), 'Manual category selection must prevent smart title matching from overriding the user');
assert(addModal.includes('suggestCategoryFromHistory(title, trans'), 'Transaction titles must suggest categories from the user ledger');
assert(addModal.includes('getCategoriesForFlow(cats, entryFlow)'), 'Transaction entry must filter categories by income or expense flow');
assert(addModal.includes('const categoryOptions = entryCategories.map(category =>'), 'Transaction categories must derive from the filtered income/expense list');
assert(addModal.includes("id: 'category'"), 'Transaction entry must expose the category as a compact dropdown');
assert(legacySettings.includes('flow: newCatFlow'), 'Advanced financial settings must persist custom category flow');
assert(legacySettings.includes('categoryFlowLabel(cat, cfg.lang)'), 'Advanced financial settings must show category flow');
assert(notificationCenter.includes('onDismissItems?.(dismissalKeys)'), 'Notification center must support dismissing individual alerts');
assert(notificationCenter.includes('dismiss(selectedKeys)'), 'Notification center must support dismissing selected alerts in bulk');
assert(notificationCenter.includes("items.map(item => String(item.id || 'notification'))"), 'Notification selection must use stable notification identities');
assert(notificationCenter.includes('notificationReadKey(item, Date.now())'), 'Notification dismissal must persist a timestamped key');
assert(walletBalanceCard.includes('available < 0'), 'Wallet cards must call out negative available balances');
assert(walletBalanceCard.includes('walletWarning'), 'Wallet cards must render a warning state for overspent wallets');

const history = fs.readFileSync(path.join(srcRoot, 'screens', 'HistoryScreen.js'), 'utf8');
const reports = fs.readFileSync(path.join(srcRoot, 'screens', 'ReportsScreen.js'), 'utf8');
const pdf = fs.readFileSync(path.join(srcRoot, 'lib', 'pdf.js'), 'utf8');
const constants = fs.readFileSync(path.join(srcRoot, 'lib', 'constants.js'), 'utf8');
const trackers = fs.readFileSync(path.join(srcRoot, 'screens', 'TrackersLabScreen.js'), 'utf8');
const home = fs.readFileSync(path.join(srcRoot, 'screens', 'HomeScreen.js'), 'utf8');
const myMoney = fs.readFileSync(path.join(srcRoot, 'screens', 'MyMoneyScreen.js'), 'utf8');
const more = fs.readFileSync(path.join(srcRoot, 'screens', 'MoreScreen.js'), 'utf8');
const followUpsHub = fs.readFileSync(path.join(srcRoot, 'screens', 'FollowUpsHubScreen.js'), 'utf8');
const paymentHistory = fs.readFileSync(path.join(srcRoot, 'screens', 'PaymentHistoryScreen.js'), 'utf8');
const onboarding = fs.readFileSync(path.join(srcRoot, 'screens', 'OnboardingScreen.js'), 'utf8');

/* MYFI_ONBOARDING_DELEGATED_CURRENT_CONTRACT */
assert(
  onboarding.includes('LanguagePicker')
    && onboarding.includes('WelcomeSlide')
    && onboarding.includes('PERSONALIZATION_QUESTIONS')
    && onboarding.includes('PersonalizationSlide')
    && onboarding.includes('EssentialsSlide'),
  'Onboarding aggregate UI must preserve the current five-step component structure; detailed behavior is enforced by dedicated onboarding contracts',
);
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
assert(reports.includes('periodCard: { minHeight: 64') && reports.includes('reportTabs:'), 'Reports must use a compact period control followed by clear report tabs');
assert(reports.includes('reportShareBtn: { width: 42, height: 42'), 'Reports share action must remain a compact header action');
assert.equal(reports.includes('monthlyBudget'), false, 'Reports must not show the monthly spending limit card');
assert.equal(reports.includes("value: 'budget'"), false, 'Reports PDF sharing must not expose the removed budget section');
assert.equal(reports.includes('spendingLimit'), false, 'Reports must not keep monthly spending limit styles');
assert.equal(pdf.includes("selected.has('budget')"), false, 'Generated report PDFs must not render the removed budget section');
assert.equal(reports.includes('الرصيد المرحّل بنهاية الفترة'), false, 'Reports must not use the confusing carried-balance title');
assert(reports.includes('comparisonExpanded') && reports.includes('expandedChartPanel'), 'Comparison charts must offer an expanded view');
assert(reports.includes("value: 'comparison_chart'") && reports.includes("value: 'comparison_details'") && reports.includes("value: 'comparison'"), 'Comparison sharing must expose one top-level comparison choice with chart/details modes');
assert.equal(reports.includes('proCompareChipRail'), false, 'Comparison periods must not be duplicated as a second chip rail');
assert(reports.includes('svgSafe: true'), 'Comparison chart month labels must avoid broken Arabic SVG text shaping');
assert(reports.includes('STAGE4A_EXECUTIVE_SUMMARY'), 'Reports must show a visible executive summary before expandable sections');
assert(reports.includes('netSummaryCard') && reports.includes('stats.bal'), 'Reports top summary must focus on real report-model net income');
assert.equal(reports.includes('executiveMetrics'), false, 'Reports top summary must not repeat income and expense mini-cards');
assert(reports.includes('defaultExpanded = true'), 'Report sections must show their results immediately while remaining collapsible');
assert.equal((reports.match(/MYFI_REPORT_WALLET_INLINE/g) || []).length, 1, 'Reports must render the wallet summary once');
assert(walletBalanceCard.includes("{ar ? 'المحجوز' : 'Reserved'}"), 'Wallet summaries must expose reserved savings as a first-class metric');
assert(walletBalanceCard.includes('defaultPill'), 'Wallet list must identify the default wallet without overloading the wallet icon');
assert(notificationCenter.includes('selectionBar') && notificationCenter.includes('deleteSelectedButton'), 'Notifications must expose a clear select/delete-selected workflow');
assert.equal(notificationCenter.includes('>{L.tap}</Text>'), false, 'Notification cards must not repeat an obvious tap-to-open instruction');
assert(home.includes("quickEntryAction:{ flex: 1, flexBasis: 0"), 'Home quick actions must share equal width regardless of action count');
assert(home.includes('walletRows.length === 0') && home.includes('renderWalletStrip'), 'Home must show one or more wallets and hide the section only when none exist');
assert(home.includes("accessibilityRole=\"radio\"") && home.includes('walletStripBalance'), 'Wallet cards must expose balances while selecting the default wallet directly');
assert.equal(home.includes('s.heroFacts'), false, 'Home hero must stay focused on Available balance only');
assert(home.includes('s.homeGreeting') && home.includes('A quick view of your money today'), 'Home must lead with a compact greeting before the financial summary');
assert.equal(home.includes('homePeriodPills'), false, 'Home must not show period controls that do not change the available balance');
assert(home.indexOf('{renderWalletStrip()}') < home.indexOf('s.monthMetricsBlock') && home.indexOf('s.monthMetricsBlock') < home.indexOf('{renderQuickEntry()}'), 'Home must keep adaptive wallets near Available balance, before the month summary and quick add');
['history', 'budget', 'reports', 'basira', 'allocation'].forEach(key => assert(myMoney.includes(`key: '${key}'`), `My Money must expose the real ${key} gateway`));
assert.equal(myMoney.includes("key: 'transfer'"), false, 'Transfer is a direct action, not a sixth My Money gateway');
assert.equal(myMoney.includes('GatewayCard'), false, 'My Money must not turn navigation into dense financial summary cards');
assert.equal(myMoney.includes('onOpenWallets'), false, 'Wallet management must not be duplicated as a primary My Money gateway');
assert.equal(myMoney.includes('QuickShortcut'), false, 'My Money must not repeat its gateways in a separate shortcut strip');
assert(myMoney.includes('خطة توزيع الدخل') && myMoney.includes('onOpenIncomeAllocation'), 'Income allocation must remain a real My Money destination');
['onOpenWallets', 'onOpenCategories', 'onOpenSubscriptions', 'onOpenBenefits'].forEach(callback => assert(more.includes(callback), `More must preserve ${callback} discoverability`));
assert.equal(more.includes('onOpenBasira'), false, 'Basira belongs to My Money and must not be duplicated in More');
assert(followUpsHub.includes('ملخص المتابعات') && followUpsHub.includes('paymentsThisMonth'), 'Follow-ups must expose a data-backed quick summary');
assert.equal(followUpsHub.includes('يحتاج انتباهك'), false, 'Needs attention must live only on Home, not duplicate Follow-ups');
assert(paymentHistory.includes('التسلسل الزمني') && paymentHistory.includes('monthEntries'), 'Payment history must expose a visible summary and timeline');
assert(homeCenter.includes('identityText') && homeCenter.includes('accountState'), 'Account center must use a compact identity card with explicit connection state');
assert(legacySettings.includes('monthNameStyle') && legacySettings.includes('monthStyleLabel'), 'Advanced settings must preserve the global month display preference');
assert(constants.includes("monthNameStyle: 'system'"), 'Month display preference must follow the phone by default');
assert(constants.includes("history: 'mymoney'") && constants.includes("reports: 'mymoney'") && constants.includes("settings: 'more'"), 'Legacy start tabs must migrate into the four-root navigation');
assert(constants.includes("['home', 'mymoney', 'trackers', 'more']"), 'Default start tab must accept only the four current root destinations');
assert(home.includes('formatMonthLabel') && home.includes('cfg.monthNameStyle'), 'Home month labels must follow the global month display preference');
assert(trackers.includes('const paidThisMonth ='), 'Commitment cards must derive whether the current month was paid');
assert(trackers.includes("if (status === 'paidMonth') return T.paidMonth;") && !trackers.includes('style={[s.paidNotice,'), 'Commitment cards must show paid-this-month once through the status label without a duplicate notice');
assert(trackers.includes('cycleMonth: tx.commitmentMonth'), 'Commitment trackers must preserve the due cycle for every payment');
assert(trackers.includes('formatCommitmentDate(payment.date'), 'Commitment payment history must show the actual payment date');
assert(trackers.includes('T.completionRetention'), 'Completed trackers must explain the seven-day review period');
assert(trackers.includes("item.status === 'done' && !item.ended"), 'Completed trackers must show the retention notice before archive');
assert(trackers.includes('filterRail') && trackers.includes('filterChip') && !trackers.includes('filterMenuOpen'), 'Tracker type selection must use a direct horizontal chip rail, not a dropdown');
assert.equal(trackers.includes('<View style={[s.screenHeader'), false, 'Trackers must not show an explanatory header above the quick entry panel');
assert.equal(trackers.includes('الالتزامات تقاس بالشهر'), false, 'Trackers must not show the explanatory subtitle');
assert(trackers.includes('trackerQuickEntry'), 'Trackers must show a Home-style quick action panel');
assert(trackers.includes("cfg.entryMode === 'quick'"), 'Trackers quick action panel must render only in the shared quick-entry mode');
assert(home.includes("cfg.entryMode === 'quick'"), 'Home quick actions must render only in the shared quick-entry mode');
assert(trackers.includes('trackerQuickEntryTitle') && trackers.includes("isAr ? 'إجراءات مباشرة' : 'Direct actions'"), 'Trackers quick actions must use the same Direct actions language as Home');
assert.equal(trackers.includes('trackerQuickEntryHint'), false, 'Tracker direct actions must not add explanatory helper copy');
assert(trackers.includes("onNewTracker?.({ trackerType: 'owed' })"), 'Quick entry must provide a dedicated debt-I-owe card');
assert(trackers.includes("onNewTracker?.({ trackerType: 'receivable' })"), 'Quick entry must provide a dedicated debt-owed-to-me card');
assert(trackers.includes("onNewTracker?.({ trackerType: 'goal' })"), 'Quick entry must provide a dedicated saving card');
assert(trackers.includes("onNewTracker?.({ trackerType: 'commitment' })"), 'Quick entry must provide a dedicated commitment card');
assert.equal(trackers.includes('headerAddBtn'), false, 'Trackers must not keep the add button in the top header');
assert.equal(trackers.includes('quickTrackerEntry'), false, 'Trackers must not use a separate tracker-only entry-mode flag');
assert(trackers.includes('summaryGrid') && trackers.includes('SummaryTile'), 'Trackers must show debt, saving, and commitment summary tiles');
assert(trackers.includes('KeyboardAvoidingView') && trackers.includes("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}"), 'Tracker edit modals must rise with the keyboard');
assert.equal(trackers.includes("sort((a, b) => (a.id === openId"), false, 'Opening a tracker card must not move it to the top');
assert(trackers.includes('expandedPaymentHistoryId'), 'Tracker payment history must stay hidden behind an explicit reveal state');
assert(trackers.includes('historyToggle'), 'Tracker payment history must use a reveal button instead of opening automatically');
assert(trackers.includes('accessibilityState={{ expanded: historyOpen }}'), 'Tracker payment history reveal must expose expanded state');
assert.equal(trackers.includes('+ إدخال سريع'), false, 'Trackers screen must not expose financial-entry quick buttons');
assert.equal(trackers.includes('+ إدخال كامل'), false, 'Trackers screen must not expose financial-entry full buttons');
assert.equal(trackers.includes('onQuickEntry'), false, 'Trackers must keep financial entry actions out of tracker creation');
assert.equal(trackers.includes('trackerAddPanel'), false, 'Trackers must not show a second add panel under the header');
assert.equal(trackers.includes('quickEntry'), false, 'Trackers must not receive money-entry mode props');
assert(appRoot.includes("classicEntry && tab === 'home'"), 'Classic mode must keep the money-entry FAB on Home');
assert(appRoot.includes("classicEntry && tab === 'trackers'"), 'Classic mode must show the matching FAB on Trackers');
assert(appRoot.includes('onPress={() => openNewTracker()}'), 'Classic tracker FAB must open tracker creation, including commitments');
assert.equal(/<AddTransModal[\s\S]*?onNewTracker=\{openNewTracker\}/.test(appRoot), false, 'Transaction modal must not open tracker creation from money entry');
assert.equal(appRoot.includes("['home', 'trackers']"), false, 'Trackers must not share the general floating entry button');
assert(newItemModal.includes('headerIconBtn'), 'Tracker creation modal must use the refreshed compact header');
assert(newItemModal.includes('active ? option.color : th.cardHigh'), 'Tracker creation modal must make the selected mode visually decisive');
assert(newItemModal.includes('selectSheetPanel'), 'Tracker creation choices must use the floating picker design');
assert(newItemModal.includes("typeBtn: { width: '48.5%'"), 'Tracker creation type cards must be symmetric instead of squeezed into one row');
assert(newItemModal.includes('requestedTrackerType'), 'Tracker creation must honor the tracker type selected from quick actions');
assert.equal(newItemModal.includes('value={note}'), false, 'Tracker creation must not show the removed optional note field');
assert(newItemModal.includes('dedicatedTrackerLaunch'), 'Tracker quick actions must open a dedicated creation sheet for the selected tracker type');
assert(newItemModal.includes('isTracker && !dedicatedTrackerLaunch'), 'Dedicated tracker creation sheets must not show the classic tracker type switcher');
assert.equal(newItemModal.includes('trackerHeaderCard'), false, 'Tracker creation must not repeat the selected type in a Ready-to-enter header card');
assert.equal(newItemModal.includes("'Ready to enter'"), false, 'Tracker creation must not show Ready to enter helper text');
assert(newItemModal.includes('entryField') && newItemModal.includes('amountInput'), 'Tracker creation must keep the compact amount/title card layout');
assert(newItemModal.includes('originImpactText') && newItemModal.includes('originImpactPill'), 'Debt creation must show wallet impact as one compact status line');
assert(newItemModal.includes('commitmentRepeatMonthly') && newItemModal.includes('repeatMonthly: commitmentRepeatMonthly'), 'Commitment creation must persist monthly versus one-time repeat mode');
assert(newItemModal.includes("id: 'commitment-repeat'"), 'Commitment category and repeat must render as a symmetric picker pair');
assert(newItemModal.includes('selectFieldBlock: { flex: 1, flexBasis: 0'), 'Tracker paired fields must split available width equally');
assert(newItemModal.includes('labelInside'), 'Tracker date fields must keep labels inside matching field cards');
assert(addModal.includes('dedicatedQuickEntry'), 'Home quick actions must open dedicated money-entry sheets');
assert(addModal.includes('!dedicatedQuickEntry'), 'Dedicated money-entry sheets must not show the classic entry type switcher');
assert(newItemModal.includes('selectField: { minHeight: 64'), 'Tracker creation paired select cards must use the same compact fixed height as transaction entry');
assert.equal(newItemModal.includes('selectedFirstOptions'), false, 'Tracker creation wallet choices must keep their stable order');
assert.equal(newItemModal.includes('walletChip'), false, 'Tracker creation must not keep the old horizontal wallet chip rail');
assert(newItemModal.includes("id: 'plan-wallet'"), 'Linked monthly commitments must use the redesigned wallet picker');
assert(newItemModal.includes("id: 'commitment-wallet'"), 'Standalone commitments must use the redesigned wallet picker');
assert(notificationCenter.includes('policyStrip'), 'Notification center must explain automatic dismissal retention');
assert.equal(notificationCenter.includes('dismiss(itemKeys)'), false, 'Notification center must not expose delete-all; ordinary alerts are removed only through explicit selection');
assert(home.includes('profileButton') && !home.includes('profilePill'), 'Home top bar must use a balanced avatar-only account action');
assert(home.includes('accountInitial'), 'Home avatar action must preserve the account identity initial');
assert.equal(homeCenter.includes('profileHandle'), false, 'Account center must not invent a second username/handle identity');
assert(home.includes('avatarUri') && !home.includes('walletPopup'), 'Home must support a local avatar without restoring the retired wallet popup picker');
assert(home.includes('attentionHeader'), 'Important states must use the shared attention header');
assert(home.includes('expandedRecentId'), 'Home transactions must expose inline expandable details');
assert(home.includes('detailsToggle'), 'Home transaction rows must use a down-arrow details toggle');
assert(home.includes('inlineDetails'), 'Home transaction details must appear in place');
assert(home.includes("direction: 'expense', color: th.exp"), 'Home expense quick action must use the red minus direction mark');
assert(home.includes("direction: 'income', color: th.inc"), 'Home income quick action must use the green plus direction mark');
assert.equal(home.includes('payCommitment(item.id'), false, 'Home commitment actions must open the wallet-aware payment modal');
assert(home.includes('onQuickCommitment(item.id)'), 'Home commitment actions must route through the wallet-aware payment modal');
assert(home.includes('postponeCommitmentFromHome') && home.includes('deferCommitment'), 'Home commitment tasks must expose the existing deferral action');
assert(home.includes('item.actionable'), 'Home must include actionable commitments in important states');
assert(
  home.includes("item.key === 'attention'")
    && home.includes('attentionItems.length || healthNeedsAttention'),
  'Important states must remain visible for due items or financial-health warnings',
);

/* MYFI_STAGE3_FINAL_VISUAL_CONTRACT */
assert(
  /selectFieldBlock\s*:\s*\{\s*flex:\s*1,\s*flexBasis:\s*0,\s*minWidth:\s*0,\s*height:\s*64/.test(newItemModal)
    && /selectField\s*:\s*\{\s*minHeight:\s*64,\s*height:\s*64/.test(newItemModal)
    && /dateButton\s*:\s*\{\s*minHeight:\s*64,\s*height:\s*64,\s*borderRadius:\s*13/.test(newItemModal),
  'Tracker Date/Month/Wallet paired cards must have exact equal geometry and radius',
);
assert(
  /selectFieldBlock\s*:\s*\{\s*flex:\s*1,\s*flexBasis:\s*0,\s*minWidth:\s*0,\s*height:\s*64/.test(addModal)
    && /selectField\s*:\s*\{\s*minHeight:\s*64,\s*height:\s*64/.test(addModal)
    && /dateButton\s*:\s*\{\s*minHeight:\s*64,\s*height:\s*64,\s*borderRadius:\s*13/.test(addModal)
    && /repeatField\s*:\s*\{\s*minHeight:\s*64,\s*height:\s*64/.test(addModal),
  'Money-entry paired cards must have exact equal 64px geometry',
);
assert.equal((trackers.match(/STAGE3_FINAL_COMMITMENT_HISTORY/g) || []).length, 1, 'Commitments must render exactly one payment-history block');
assert.equal((trackers.match(/\{T\.commitmentHistory\}/g) || []).length, 1, 'Commitment history title must appear exactly once in tracker JSX');
assert.equal(trackers.includes('stage3v41'), false, 'Trackers must not depend on leftover Stage 3 patch override styles');
assert(trackers.includes('STAGE3_FINAL_SIDE_METRIC') && trackers.includes('s.metricSide'), 'Trackers must use the final flat amount/side-metric card hierarchy');
assert(trackers.includes('cardAccent: { height: 4') && trackers.includes('function SummaryTile({ th, lang, item, value })'), 'Trackers must use the final visual hierarchy and horizontal summary tile component');
assert(home.includes('STAGE3_FINAL_IMPORTANT_DECISION'), 'Important states must use the final commitment decision-card layout');
assert(home.includes('importantS.actions') && home.includes('postponeCommitmentFromHome'), 'Important states must show equal Pay and Postpone controls');
assert(home.includes('STAGE4_COMPACT_IMPORTANT_DECISION') && home.includes('importantS.amountBlock'), 'Important-state commitments must use the compact Stage 4 decision row');
assert.equal(home.includes('importantS.factCard'), false, 'Home commitment cards must not spend vertical space on separate Due/Amount fact cards');
assert.equal(home.includes('renderCommitmentRow'), false, 'Home must not keep the obsolete Pay-only commitment row renderer');


/* MYFI_STAGE4_AB_COMPACT_REFINEMENT */
assert(
  /action:\s*\{[^}]*height:\s*34/.test(home)
    && /card:\s*\{[^}]*paddingHorizontal:\s*8,\s*paddingVertical:\s*7/.test(home),
  'Home commitment decision cards must stay compact while preserving both actions',
);
assert(walletBalanceCard.includes('walletIdentity') && walletBalanceCard.includes('walletAvailableBlock'), 'Home wallet picker must use compact balance rows');
assert.equal(walletBalanceCard.includes('style={[s.walletMetrics'), false, 'Home wallet rows must not expand into three stacked metric cards');
assert.equal(homeCenter.includes('getOrCreateDeviceId') || homeCenter.includes('LOCAL-${'), false, 'Local device implementation IDs must stay out of account UX');
assert.equal(homeCenter.includes('localIdentity') || homeCenter.includes('connectedIdentity'), false, 'Account center must keep one identity instead of local/cloud identity labels');
assert(homeCenter.includes("connectedAccount && user?.email"), 'Email must only render when the account is connected');
assert(homeCenter.includes("connectedAccount && user?.email ? user.email : L.local"), 'Home account center must keep one identity line and switch only its account state');
assert(demoData.includes("linkedType: 'debt'") && demoData.includes("linkedId: 'demo_linked_debt'"), 'Demo workspace must include a debt converted to a linked commitment');
assert(demoData.includes("linkedType: 'goal'") && demoData.includes("linkedId: 'demo_linked_goal'"), 'Demo workspace must include a goal linked to a commitment');
assert(demoData.includes('demo_commitment_unpaid') && demoData.includes('demo_commitment_deferred'), 'Demo workspace must show unpaid and deferred commitment states');
assert(demoData.includes('demo_linked_goal') && demoData.includes('savings: []'), 'Demo workspace must include a goal with no savings this month');
assert(demoData.includes('demo_recurring_streaming_prev') && demoData.includes('demo_recurring_side_income_prev'), 'Demo workspace must include due recurring expense and income examples');


/* MYFI_STAGE4_SETTINGS_DATE_WALLET_REFINEMENT */
assert(settings.includes("label: T.useDeviceSetting") && settings.includes('subtitle={languageNote}') && settings.includes('subtitle={themeNote}'), 'Language/appearance must show the resolved value and keep device-following as a note/action');
assert(newItemModal.includes("planDate: ar ? 'تاريخ الدفع' : 'Payment date'"), 'Commitments must label their selected day as Payment date');
assert.equal(newItemModal.includes('monthOnly'), false, 'Commitment creation and linked commitments must use a normal day-level date picker');
assert(newItemModal.includes('firstDueISO: startDate') && newItemModal.includes('firstDueISO: planDate'), 'Commitment creation must persist the exact selected payment date');
assert.equal(newItemModal.includes("· ${isAr ? 'كلي' : 'Total'}"), false, 'Tracker wallet pickers must show Available only, not Total balance details');
assert(addModal.includes("${cfg.lang === 'ar' ? 'متاح' : 'Available'}") && !addModal.includes("${cfg.lang === 'ar' ? 'كلي' : 'Total'}"), 'Income, expense, payment, and Smart wallet choices must show Available only');
assert(trackers.includes('firstDueISO: draft.date'), 'Editing a commitment must preserve the exact selected payment date');
assert.equal(trackers.includes("monthOnly={editTrackerDraft?.kind === 'monthly'}"), false, 'Commitment editing must use a normal day-level date picker');
assert(trackers.includes('dueDateLabel = formatCommitmentDate') && trackers.includes('daysUntil < 0'), 'Commitment status must evaluate the selected due day, not only its month');
assert.equal(home.includes('s.heroFacts'), false, 'Home must keep wallet balance detail out of the main hero and show only Available balance');
assert(home.includes("'الرصيد المتاح' : 'Available balance'"), 'Home main balance must remain explicitly Available balance');
assert(walletBalanceCard.includes("'الكلي' : 'Total'") && walletBalanceCard.includes("محجوز للتوفير") && walletBalanceCard.includes("'المتاح' : 'Available'"), 'Detailed wallet balance breakdown must remain available inside the wallet list');


/* MYFI_STAGE4_MASTER_REFINEMENT */
assert(constants.includes("{ key: 'saving', visible: true }") && constants.includes("{ key: 'net', visible: true }"), 'Home month summary must include Savings and Net by default');
assert(constants.includes('HOME_LAYOUT_VERSION = 3'), 'Home layout must migrate existing profiles to the restored four-card summary');
assert(home.includes("item.key === 'saving'") && home.includes('monthSavingTotal'), 'Home must calculate and render actual current-month goal savings');
assert(home.indexOf('{renderWalletStrip()}') < home.indexOf('{visibleHomeCards.length > 0 ? (') && home.indexOf('{visibleHomeCards.length > 0 ? (') < home.indexOf('{renderQuickEntry()}'), 'Home must render compact wallets below the balance, then month summary and quick add');
assert(walletBalanceCard.includes('lock-closed-outline') && walletBalanceCard.includes('محجوز للتوفير'), 'Reserved savings must use a clear compact locked-savings treatment in the wallet list');
assert(walletBalanceCard.includes(".sort((a, b) => (a.id === defaultId ? -1"), 'The selected default wallet must sort to the first position');
assert(home.includes("onPress={() => setCfg({ defaultWalletId: wallet.id })}") && !home.includes('renderWalletPanel'), 'Tapping a Home wallet must set it as default directly without opening the old wallet list');
assert(trackers.includes('filterRailTitle') && trackers.includes('filterCount'), 'Tracker type selection must expose direct type chips with counts');
assert(reports.includes('walletRailBlock') && reports.includes('walletChip') && !reports.includes("setSheet('wallet')"), 'Report wallet selection must use a direct horizontal wallet rail instead of a dropdown');
assert(reports.includes('reportInsightList') && reports.includes('reportRows') && reports.includes('reportInlineDetail'), 'Reports must use one compact drill-down list with each active detail rendered inline under its own row');
assert(reports.includes('reportTabs') && reports.includes('topCategoriesCard') && reports.includes('showMoreReports'), 'Reports overview must surface the summary and top categories before progressive extra details');
assert.equal(reports.includes('<SectionCard th={th} title={C.smartTitle}'), false, 'Reports main view must remove non-essential Smart insight clutter');
assert(settings.includes('saveIdentity') && settings.includes('editIdentity'), 'Account must let local and connected users edit identity from one detail screen');
assert(settings.includes('pickAvatar') && settings.includes('T.changePhoto') && settings.includes('T.removePhoto'), 'Account must provide add/change/remove photo controls');
assert(homeCenter.includes("String(cfg.displayName || '').trim()") && homeCenter.includes('cfg.avatarUri ?'), 'Home account center must reflect the local user name and photo, not a generic local placeholder only');

assert.equal(reports.includes('reportTileGrid'), false, 'Reports must not return to the square dashboard tile grid');
assert.equal(reports.includes("detailKey === 'cashflow' && scope === 'month'"), false, 'Forecast clutter must stay out of the essential report surface');
assert(home.includes('stopRecurringFromHome'), 'Important recurring entries must support stopping the recurrence');
assert(home.includes("isAr ? 'تسجيل الآن' : 'Record now'"), 'Important recurring entries must expose a direct Record now action');
assert(home.includes("isAr ? 'إيقاف التكرار' : 'Stop recurring'"), 'Important recurring entries must expose Stop recurring without deleting history');

/* MYFI_IDENTITY_REFRESH_V4 */
assert(home.includes('const recentLimit = 3;'), 'Home recent activity must show exactly three transactions');
assert(home.includes('savingPanel') && home.includes('savingSummary') && home.includes('savingGoalRow'), 'Home savings must use the same compact panel hierarchy as other Home sections');
assert(history.includes('typeRail') && history.includes('typeChip') && history.includes('historyHead'), 'History must use the refreshed direct-filter visual hierarchy');
assert.equal(history.includes("renderFilterPicker({ id: 'type'"), false, 'History transaction type must not be duplicated inside the advanced filter sheet');


assert(reports.includes('netSummaryCard') && reports.includes("ar ? 'تفاصيل الفترة' : 'Period details'"), 'Reports must use the new net-only summary and compact period detail list');
assert(settings.includes('profileHero') && settings.includes('AccountPage') && settings.includes('AuthModal'), 'Account must use a dedicated professional profile screen with optional cloud connection');


/* MYFI_STAGE5_FOUNDATION */
assert(settings.includes('MenuGroup') && settings.includes('SectionLabel') && !settings.includes('accessibilityState={{ expanded }}'), 'Settings must use flat grouped navigation instead of nested collapsible cards');
assert(settings.indexOf('accountCard') < settings.indexOf('T.general'), 'Account identity card must be first on the Settings index');
assert(settings.includes('profileAvatarWrap') && settings.includes('cameraButton') && settings.includes('editPill'), 'Account must use an avatar-first profile surface with direct edit affordance');
assert(settings.includes('Connect MYFI account') && settings.includes("account: ar ? 'الحساب' : 'Account'") && !settings.includes('Local profile'), 'Account UX must keep one identity and expose MYFI connection only as an optional capability');
assert(history.includes('historyFilterAction') && history.includes('filterCountBadge'), 'History advanced filters must be reachable from the compact header action');
assert(history.includes('dayHeader') && history.includes('rowFirst') && history.includes('rowLast'), 'History transactions must read as grouped ledger rows rather than isolated floating cards');
assert(history.includes("diff === 0") && history.includes("diff === 1"), 'History day labels must use Today/Yesterday semantics when applicable');


assert(homeCenter.includes('identityNameRow') && !homeCenter.includes('style={[s.identityFacts'), 'Home account center must use a compact identity summary rather than metric-style account fact cards');


// Stage 5A professional settings/account contract.
assert(/rowIcon/.test(settings), 'Settings rows must expose a restrained icon hierarchy');
assert(/rowSub/.test(settings), 'Settings rows must expose concise subtitles');
assert(/accountCard/.test(settings) && /editPill/.test(settings), 'Settings must expose one account entry and one clear edit action');
assert(/إضافة صورة|Add photo/.test(settings), 'Local/connected account must expose an explicit Add photo action');
assert(/تغيير الصورة|Change photo/.test(settings), 'Account must expose an explicit Change photo action');
assert(/إزالة|Remove/.test(settings), 'Account must expose an explicit Remove photo action');
assert(!/الحساب، التفضيلات، الأمان والبيانات في مكان واحد/.test(settings), 'Settings must not use the old explanatory marketing subtitle');


/* MYFI_STAGE5B_HISTORY_LEDGER_V2 */
const transactionDetails = fs.readFileSync(path.join(srcRoot, 'components', 'TransactionDetailsModal.js'), 'utf8');
assert(history.includes('historyToolbar') && history.includes('searchBox') && history.includes('historyFilterAction'), 'History search and advanced filters must share one compact toolbar');
assert(history.includes('dayCountBadge') && history.includes('rowSignals'), 'History must use compact day-group and transaction-signal hierarchy');
assert.equal(history.includes("import ActionMenu from '../components/ActionMenu'"), false, 'History ledger rows must not carry a permanent overflow menu');
assert(history.includes('onLongPress={isOpeningBalance ? undefined : () => selection.toggle(item.id)}'), 'Long press must preserve fast multi-selection without selecting protected opening balances');
assert(history.includes('setDetails(item)'), 'Single tap must open transaction details');
assert(history.includes('canEdit={!!details') && history.includes('canDuplicate={!!details'), 'History must route edit/duplicate eligibility into transaction details');
assert(transactionDetails.includes('actionRow') && transactionDetails.includes('onEdit') && transactionDetails.includes('onDuplicate') && transactionDetails.includes('onDelete'), 'Transaction details must own edit/duplicate/delete actions');
assert(transactionDetails.includes('C.delete') && transactionDetails.includes('trash-outline'), 'Transaction details must expose a clear destructive delete action');


/* MYFI_STAGE6_CONSOLIDATED_UX */
assert(appRoot.includes("const INTERNAL_DEMO_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_INTERNAL_DEMO === '1';"), 'Demo tools must be gated behind an explicit internal development flag');
assert(appRoot.includes('INTERNAL_DEMO_ENABLED && cfg.demoMode'), 'Demo banner must never appear in the normal user build');
assert(appRoot.includes("if (!ready || INTERNAL_DEMO_ENABLED || !cfg.demoMode) return;") && appRoot.includes('exitDemoMode?.()'), 'A legacy demo session must automatically restore real data in normal user builds');

assert(appRoot.includes("const orientationMode = ['system', 'auto', 'portrait'].includes(cfg.orientationMode)"), 'Orientation must preserve device, explicit auto-rotate, and portrait choices');










assert(settings.includes('title={T.rotation}'), 'Screen rotation must stay in the public Settings UX');
assert(settings.includes("choice === 'orientation'"), 'Screen rotation must use the same device/manual choice pattern as language and appearance');
assert(settings.includes("const rotationValue = cfg.orientationMode === 'system'"), 'Screen rotation row must show the selected behavior');
assert(settings.includes("const rotationNote = cfg.orientationMode === 'system' ? T.followsDevice : null;"), 'Only the device-controlled rotation mode may show device-following');
assert(settings.includes("{ value: 'auto', label: T.autoRotate"), 'Orientation picker must expose explicit app auto-rotation');
assert(settings.includes("onSelect: value => setCfg({ orientationMode: ['system', 'auto', 'portrait'].includes(value) ? value : 'system' })"), 'Orientation picker must preserve device, auto, and portrait semantics');
assert(settings.includes("const languageNote = cfg.langMode === 'system' ? T.followsDevice : null;"), 'Preferences must show device-following under the resolved language');
assert(settings.includes("const themeNote = cfg.themeMode === 'system' ? T.followsDevice : null;"), 'Preferences must show device-following under the resolved appearance');
assert.equal(settings.includes("cfg.langMode === 'system' ? T.system"), false, 'Follow-device must not replace the visible language value');
assert.equal(settings.includes("cfg.themeMode === 'system' ? T.system"), false, 'Follow-device must not replace the visible appearance value');
assert(legacySettings.includes("MONTH_NAME_STYLES.filter(style => style !== 'system')"), 'Advanced date display choices must preserve the existing month style behavior');
assert(legacySettings.includes('INTERNAL_DEMO_ENABLED ? (') && legacySettings.includes('بيانات اختبار داخلية'), 'Demo data must remain available only as an internal advanced test tool');

assert(reports.includes('const reportRows = [') && reports.includes("key: 'comparison'"), 'Comparison must be part of the same report row model as other reports');
assert(reports.includes('visibleReportRows.map((item, index) =>') && reports.includes('reportInlineDetail'), 'Each report detail must expand directly below the selected report row');
assert.equal(reports.includes('s.reportCompareRow'), false, 'Comparison must not use a visually different top-level row');
assert.equal(reports.includes('reportCompareText'), false, 'Legacy comparison-row styling must be removed');

/* MYFI_UX_POLISH_INCOME_EXPENSE_AND_PASSWORDS */
assert(appPrimitives.includes("{income ? '+' : '-'}"), 'Income and expense direction must render as explicit plus/minus marks');
assert(home.includes("backgroundColor: th.incBg") && home.includes("backgroundColor: th.expBg"), 'Home income and expense actions must use semantic green/red surfaces');
assert(history.includes("direction: 'income', color: th.inc") && history.includes("direction: 'expense', color: th.exp"), 'History income and expense choices must use green plus/red minus semantics');
assert(reports.includes('kind="income" color={th.inc}') && reports.includes('kind="expense" color={th.exp}'), 'Report empty-state actions must use green plus/red minus semantics');

assert(legacySettings.includes("direction: item.key === 'income' ? 'income' : item.key === 'expense' ? 'expense' : null"), 'Advanced Home metric settings must use plus/minus direction marks');
assert(legacySettings.includes("direction: 'expense', color: th.exp") && legacySettings.includes("direction: 'income', color: th.inc"), 'Category flow choices must use red minus/green plus semantics');
assert(
  theme.includes('export const INCOME_GREEN = BRAND_GREEN;')
    && theme.includes('inc: INCOME_GREEN')
    && theme.includes("exp: '#C74F5C'")
    && theme.includes("exp: '#E06B76'"),
  'Light and dark themes must preserve the semantic income green and their expense reds',
);
assert(accountDelete.includes('secureTextEntry={!passwordVisible}') && accountDelete.includes("passwordVisible ? 'eye-off-outline' : 'eye-outline'"), 'Account deletion password must have a show/hide control');
assert(archive.includes('secureTextEntry={!archivePasswordVisible}') && archive.includes("archivePasswordVisible ? 'eye-off-outline' : 'eye-outline'"), 'Archive password must have a show/hide control');
assert(legacySettings.includes('secureTextEntry={!backupPasswordVisible}') && legacySettings.includes("backupPasswordVisible ? 'eye-off-outline' : 'eye-outline'"), 'Legacy backup password must have a show/hide control');
assert(auth.includes('secureTextEntry={!passwordVisible}') && passwordRecovery.includes('secureTextEntry={!passwordVisible}') && passwordRecovery.includes('secureTextEntry={!confirmationVisible}'), 'Authentication and recovery password fields must retain show/hide controls');

/* MYFI_STARTUP_TIMING_DEVICE_EVIDENCE */
assert(appRoot.includes("import { recordStartupTiming } from './src/lib/startupTiming';"), 'App startup must retain the timing recorder');
assert(appRoot.includes("recordStartupTiming(startupMarks, 'completed');") && appRoot.includes("recordStartupTiming(startupMarks, 'failed');"), 'Completed and failed launches must both preserve timing evidence');
assert(settings.includes("import { readStartupTiming } from '../lib/startupTiming';"), 'Settings must read the in-memory startup timing evidence');
assert(settings.includes('const showStartupTiming = () => {') && settings.includes('onShowStartupTiming={showStartupTiming}'), 'Settings must wire startup timing into Account');
assert(settings.includes("title={isAr ? 'توقيت فتح التطبيق' : 'App startup timing'}"), 'Account must expose a phone-friendly startup timing action');
assert(startupTiming.includes('stepMs: durations') && startupTiming.includes('readyMeansReactWasToldToRender: true'), 'Timing evidence must expose step durations and the first-render caveat');
assert.equal(startupTiming.includes('AsyncStorage'), false, 'Startup timing must stay in-memory and never persist stale diagnostic evidence');
assert.equal(startupTiming.includes('amount'), false, 'Startup timing diagnostic must not include financial values');

/* MYFI_GLOBAL_MAINTENANCE_VISIBILITY_AND_STARTUP */
const syncSlice = fs.readFileSync(path.join(srcRoot, 'store', 'slices', 'useSyncSlice.js'), 'utf8');
const maintenanceBarrier = fs.readFileSync(path.join(srcRoot, 'lib', 'financialMaintenanceBarrier.js'), 'utf8');
assert(maintenanceBarrier.includes("presentation = 'blocking'") && maintenanceBarrier.includes('visible: !!visibleMaintenance'), 'Maintenance must keep write fencing separate from whether a full-screen overlay is shown');
assert(appRoot.includes('const maintenanceOverlay = financialMaintenance.visible ?'), 'The mounted app must only show maintenance UI for explicitly visible work');
assert(syncSlice.includes('hasSteadyFinancialCloudRecoveryStateV2') && syncSlice.includes("financial_cloud_recovery_local_has_data"), 'Routine V2 sync must prove its existing local state before entering recovery maintenance');
assert(syncSlice.includes("deferProfileHydration = false") && syncSlice.includes('hydrateProfileWhenSafe'), 'Startup may render durable local data before optional cloud profile hydration');
assert(appRoot.includes('unchangedSession: true') && appRoot.includes('deferProfileHydration: true'), 'Duplicate cold-start auth events must not repeat workspace/profile hydration');

console.log('MYFI modal and settings UI contract: all assertions passed');
