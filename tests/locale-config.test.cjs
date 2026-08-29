const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const constants = fs.readFileSync(path.join(root, 'src', 'lib', 'constants.js'), 'utf8');
const onboarding = fs.readFileSync(path.join(root, 'src', 'screens', 'OnboardingScreen.js'), 'utf8');

assert(constants.includes("country: 'IQ'"), 'Iraq must remain the product default country');
assert(constants.includes("currency: 'IQD'"), 'IQD must remain the product default currency');
assert(onboarding.includes("? cfg.country : 'IQ'"), 'Onboarding must fall back to Iraq instead of the phone region');
assert(constants.includes("code:'ILS'") && constants.includes("sym:'₪'") && constants.includes("name:'الشيكل الجديد'") && constants.includes("nameEn:'New shekel'"), 'ILS must remain selectable under a neutral currency name');
assert(!/code:'IL'|name:'إسرائيل'|nameEn:'Israel'|Israeli shekel/.test(constants), 'Israel must not be reintroduced as a country or currency label');
assert(constants.includes("code:'PS'") && constants.includes("flag:'🇵🇸', currency:'JOD'"), 'Palestine must use a supported default currency');

console.log('MYFI locale configuration: PASSED');
