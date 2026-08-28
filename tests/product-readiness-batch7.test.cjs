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
// The approved flow is deliberately five screens: Welcome with its explicit
// language choice -> three visual personalization questions -> financial essentials.
// Privacy is visible in Essentials, not an extra blocking screen.
assert(onboarding.includes('LanguagePicker') && onboarding.includes('WelcomeSlide') && onboarding.includes('PERSONALIZATION_QUESTIONS') && onboarding.includes('PersonalizationSlide') && onboarding.includes('EssentialsSlide'), 'Onboarding must implement the language choice inside welcome, three personalization questions, and financial essentials');
assert(onboarding.includes('const WELCOME_STEP = 0;') && onboarding.includes('const QUESTION_START_STEP = 1;') && onboarding.includes('const STEP_COUNT = ESSENTIALS_STEP + 1;') && onboarding.includes('step >= QUESTION_START_STEP && step < ESSENTIALS_STEP'), 'Onboarding must expose exactly three questionnaire steps inside the five-step flow after welcome');
assert(!onboarding.includes('languageConfirmed'), 'The welcome language toggle must not require an early confirmation gate');
assert(onboarding.includes("langMode: 'manual'") && /finish = async[\s\S]*?langMode: 'manual'/.test(onboarding), 'The welcome language selection must persist as a whole-app preference when onboarding finishes');
assert(onboarding.includes('accessibilityRole="radio"'), 'The welcome language toggle must keep radio accessibility semantics');
assert(onboarding.includes('modulesForPersonalization') && onboarding.includes('onboardingPersonalization: answers'), 'Onboarding answers must configure supported modules instead of acting as decorative profile labels');
assert(onboarding.includes("multiple: true") && onboarding.includes("accessibilityRole={question.multiple ? 'checkbox' : 'radio'}") && onboarding.includes('onboardingPriorities: focusPriorities'), 'The complementary goals question must allow one or more selections and persist every selected priority');
assert.equal(onboarding.includes("id: 'detail'"), false, 'Onboarding must not ask the ambiguous detail-level question');
assert.equal(/skipCurrent|T\.skip|skipButton|skipText/.test(onboarding), false, 'Onboarding must not expose a skip path');
assert.equal(onboarding.includes('اللغة والمظهر والتاريخ يتبعون جهازك'), false, 'Onboarding must not explain automatic device preferences');
assert(settings.includes('T.gettingStarted') && settings.includes('T.dailyMoney') && settings.includes('T.planningGuide') && settings.includes('T.reportsGuide'), 'Guide must teach the core financial workflow by task');

assert(backup.includes("MYFI_BACKUP_KIND = 'myfi_financial_backup'"), 'Backup must be explicitly financial');
assert(backup.includes('pickFinancialBackupConfig'), 'Backup must whitelist financial config');
assert(dataSlice.includes('buildFinancialBackup'), 'Export must use the financial backup builder');
assert(dataSlice.includes('mergeFinancialBackupConfig'), 'Restore must preserve non-financial settings');
assert(dataSlice.includes('notif: current.notif'), 'Restore must preserve notification preferences');
assert.equal(/trans, debts, goals, wallets, commitments, cats, cfg, notif/.test(dataSlice), false, 'Export must not serialize the full config or notifications');

console.log('MYFI Batch 7 product-readiness contract passed.');
