// MaalFlow §112 — OCR / voice privacy gate contract.
//
// Guards the finding this gate exists for: a receipt photo goes to OpenAI/Google and a
// voice note is uploaded as raw audio, so the user must be told before either capture
// starts. The ordering assertions matter more than the presence ones — a disclosure
// shown after the OS permission prompt lets someone grant camera access without ever
// learning where the photo goes.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const consent = read('src/lib/smartCaptureConsent.js');
const modal = read('src/components/AddTransModal.js');
const constants = read('src/lib/constants.js');

// --- the two consents are independent, and neither is account/sync consent ---
assert(consent.includes("smartCaptureImageConsent"), 'image consent field missing');
assert(consent.includes("smartCaptureVoiceConsent"), 'voice consent field missing');
assert(
  consentFieldsAreDistinct(),
  'image and voice consent must be stored separately: they disclose different data',
);
function consentFieldsAreDistinct() {
  return /kind === 'voice'\s*\?\s*'smartCaptureVoiceConsent'\s*:\s*'smartCaptureImageConsent'/.test(consent);
}
assert.equal(
  /accountConsentAccepted/.test(consent.replace(/\/\/[^\n]*/g, '')),
  false,
  'account/sync consent must never be read as smart-capture permission',
);

// --- consent is versioned, so changing the disclosure re-asks ---
assert(/SMART_CAPTURE_CONSENT_VERSION\s*=\s*\d+/.test(consent), 'consent must be versioned');
assert(
  />=\s*SMART_CAPTURE_CONSENT_VERSION/.test(consent),
  'stored consent must be compared against the current disclosure version, not truthiness',
);

// --- the disclosure names what leaves the device, and where it goes ---
for (const lang of ['ar', 'en']) {
  const sample = lang === 'ar' ? consent : consent;
  assert(sample.includes('OpenAI'), 'disclosure must name the provider');
}
assert(consent.includes('Google'), 'disclosure must name the second provider');
assert(
  consent.includes('اختيارية بالكامل') && consent.includes('entirely optional'),
  'disclosure must state the feature is optional in both languages',
);

// --- declining must not be remembered as a permanent opt-out ---
assert(
  /if \(!accepted\) return false;/.test(consent),
  'a decline must leave stored consent untouched so the next attempt asks again',
);

// --- ORDERING: disclosure strictly before the OS permission prompt ---
const imageGate = modal.indexOf("requestSmartCaptureConsent({ cfg, setCfg, kind: 'image'");
const imagePermission = modal.indexOf('ImagePicker.requestCameraPermissionsAsync');
assert(imageGate > 0, 'receipt capture is not gated');
assert(
  imageGate < imagePermission,
  'privacy disclosure must run BEFORE the camera/photo permission prompt',
);

const voiceGate = modal.indexOf("requestSmartCaptureConsent({ cfg, setCfg, kind: 'voice'");
const voicePermission = modal.indexOf('AudioModule.requestRecordingPermissionsAsync');
assert(voiceGate > 0, 'voice capture is not gated');
assert(
  voiceGate < voicePermission,
  'privacy disclosure must run BEFORE the microphone permission prompt',
);

// --- a declined gate must stop the flow, not fall through ---
// Asserted on the span between the gate and the permission call rather than on exact
// whitespace, so the contract survives reformatting and CRLF checkouts.
const spanBetween = (from, to) => modal.slice(from, to);

assert(
  /if \(!consented\) return;/.test(spanBetween(imageGate, imagePermission)),
  'receipt capture must return when consent is declined, before requesting camera access',
);
assert(
  /if \(!consented\) return;/.test(spanBetween(voiceGate, voicePermission)),
  'voice capture must return when consent is declined, before requesting the microphone',
);

// --- defaults are off ---
assert(
  /smartCaptureImageConsent: 0/.test(constants) && /smartCaptureVoiceConsent: 0/.test(constants),
  'both consents must default to ungranted',
);

console.log('MaalFlow §112 smart-capture privacy gate contract: PASS');
