const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || process.cwd());
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const onboarding = read('src/screens/OnboardingScreen.js');
const constants = read('src/lib/constants.js');

assert(onboarding.includes('detectSystemLang'), 'Onboarding must import system language detection');
assert(onboarding.includes('useState(detectSystemLang())'), 'First-run onboarding must start from the device language');
assert(onboarding.includes('LanguagePicker') && onboarding.includes('WelcomeSlide'), 'The welcome screen must offer a language toggle');
assert(!onboarding.includes('languageConfirmed'), 'The welcome language toggle must not require an early confirmation gate — it stays a live reading-direction preview until Essentials');
assert(onboarding.includes('const WELCOME_STEP = 0;') && onboarding.includes('const QUESTION_START_STEP = 1;') && onboarding.includes('const STEP_COUNT = ESSENTIALS_STEP + 1;'), 'Onboarding must remain a concise five-step flow with language on welcome');
assert(onboarding.includes('PERSONALIZATION_QUESTIONS') && onboarding.includes('PersonalizationSlide'), 'Onboarding must use three visual personalization questions');
assert(onboarding.includes('ChoiceSheet') && onboarding.includes('EssentialsSlide'), 'Onboarding must collect the real financial essentials through accessible selectors');
assert(/function EssentialsSlide\([\s\S]*?onLanguage/.test(onboarding), 'Essentials must include the app-language row alongside country/currency/appearance');
assert(onboarding.includes("langMode: 'manual'") && /finish = async[\s\S]*?langMode: 'manual'/.test(onboarding), 'Finishing onboarding must commit whatever language the user lands on as the real app language');
assert(!onboarding.includes('typeOptions') && !onboarding.includes('personalDesc') && !onboarding.includes('businessDesc') && !onboarding.includes('mixedDesc'), 'Onboarding must not render a rigid Personal/Business/Dual selector');
assert(!/skipCurrent|T\.skip|skipButton|skipText/.test(onboarding), 'Onboarding must not expose a skip path');
assert(constants.includes('navigator') && constants.includes('nav?.languages'), 'System language detection must prefer device navigator languages');
assert(constants.includes("return 'en';"), 'Language detection fallback must be English, not Arabic');

console.log('MYFI onboarding runtime regressions passed.');
