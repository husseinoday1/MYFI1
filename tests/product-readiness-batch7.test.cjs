const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(process.argv[2] || '.');
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');

const app = read('App.js');
const settings = read('src/screens/SettingsScreen.js');
const history = read('src/screens/HistoryScreen.js');
const onboarding = read('src/screens/OnboardingScreen.js');
const backup = read('src/lib/backupData.js');
const dataSlice = read('src/store/slices/dataSlice.js');

assert(!app.includes('FirstUseGuideModal') && settings.includes('function GuidePage') && settings.includes("onOpen('guide')"), 'The user guide must remain available in Settings without interrupting first use after onboarding');
assert(settings.includes('onOpenGuide') && settings.includes('T.guide'), 'Settings must expose the task-based user guide');
assert(settings.includes('T.support') && settings.includes('MenuGroup'), 'Settings must contain a grouped Help area');
assert(settings.includes("about: ar ? 'حول MYFI' : 'About MYFI'"), 'Settings must contain About MYFI');
assert(settings.includes('EXPO_PUBLIC_MYFI_INSTAGRAM_URL') && settings.includes('EXPO_PUBLIC_MYFI_FACEBOOK_URL'), 'Social shortcuts must use real configurable URLs');
assert.equal(settings.includes('الهوية، المزامنة وتسجيل الدخول'), false, 'Verbose settings section subtitles must be removed');
assert.equal(settings.includes('اضبط MYFI حسب طريقة استخدامك'), false, 'Verbose usage subtitle must be removed');
assert.equal(history.includes('historyEyebrow'), false, 'History must not show a decorative MYFI eyebrow');
// Onboarding is now the LOCKED 6-step flow per
// docs/design/06_MYFI_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md §7 (Welcome
// -> Priorities -> Customize -> Create first wallet -> Privacy -> Complete),
// replacing the prior 3-slide (value/insight/setup) design this assertion
// used to check for. Updated 2026-08-27 to check for the current, intentional
// 6-step contract instead — not deleted, not skipped.
assert(onboarding.includes('WelcomeSlide') && onboarding.includes('PrioritySlide') && onboarding.includes('CustomizeSlide') && onboarding.includes('WalletSlide') && onboarding.includes('PrivacySlide') && onboarding.includes('CompleteSlide'), 'Onboarding must implement the locked 6-step flow: welcome, priorities, customize, wallet, privacy, complete');
assert.equal(onboarding.includes('اللغة والمظهر والتاريخ يتبعون جهازك'), false, 'Onboarding must not explain automatic device preferences');
assert(settings.includes('T.gettingStarted') && settings.includes('T.dailyMoney') && settings.includes('T.planningGuide') && settings.includes('T.reportsGuide'), 'Guide must teach the core financial workflow by task');

assert(backup.includes("MYFI_BACKUP_KIND = 'myfi_financial_backup'"), 'Backup must be explicitly financial');
assert(backup.includes('pickFinancialBackupConfig'), 'Backup must whitelist financial config');
assert(dataSlice.includes('buildFinancialBackup'), 'Export must use the financial backup builder');
assert(dataSlice.includes('mergeFinancialBackupConfig'), 'Restore must preserve non-financial settings');
assert(dataSlice.includes('notif: current.notif'), 'Restore must preserve notification preferences');
assert.equal(/trans, debts, goals, wallets, commitments, cats, cfg, notif/.test(dataSlice), false, 'Export must not serialize the full config or notifications');

console.log('MYFI Batch 7 product-readiness contract passed.');
