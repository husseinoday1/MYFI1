const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || process.cwd());
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const onboarding = read('src/screens/OnboardingScreen.js');
const constants = read('src/lib/constants.js');

assert(onboarding.includes('detectSystemLang'), 'Onboarding must import system language detection');
assert(onboarding.includes('const lang = detectSystemLang();'), 'First-run onboarding must follow the device language');
assert(!onboarding.includes('index === rows.length - 1'), 'Onboarding insight rows must not reference an out-of-scope rows variable');
assert(onboarding.includes('index === preview.rows.length - 1'), 'Onboarding insight separator must use preview.rows.length');
assert(!onboarding.includes('ChoiceSheet'), 'Onboarding must not ask the user to choose setup data');
assert(!onboarding.includes('setChoice') && !onboarding.includes('onChoice('), 'Onboarding third screen must not open setup choices');
assert(!onboarding.includes('T.usage') && !onboarding.includes('T.country') && !onboarding.includes('T.currency'), 'Onboarding must not show setup choices');
assert(!onboarding.includes('personalDesc') && !onboarding.includes('businessDesc') && !onboarding.includes('mixedDesc'), 'Onboarding must not carry usage-type choice copy');
assert(onboarding.includes('PromiseRow') && onboarding.includes('T.unifiedEngine'), 'Onboarding third screen must explain MYFI value instead of collecting data');
assert(constants.includes('navigator') && constants.includes('nav?.languages'), 'System language detection must prefer device navigator languages');
assert(constants.includes("return 'en';"), 'Language detection fallback must be English, not Arabic');

console.log('MYFI onboarding runtime regressions passed.');
