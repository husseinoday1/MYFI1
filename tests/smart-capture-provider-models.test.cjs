// MaalFlow smart-ocr / smart-transcribe -- provider model + fallback contract.
//
// Both providers' "mini"/"flash-lite" model lines get renamed every few months
// (confirmed via live pricing/deprecation research, 2026-09-10): OpenAI retired
// gpt-4.1-mini from its own product surface in favor of the gpt-5 family, and
// Google's gemini-3-flash-preview fell outside the current stable Gemini lineup
// (gemini-3.6/3.7/3.8-flash). A stale hardcoded default silently ships requests to
// a model that may already error, and nothing in this repo would catch it -- these
// edge functions have no static test coverage at all before this file. Guards two
// things: the *current* default names are the ones actually in the code, and a
// failed primary provider falls through to a configured second provider instead of
// erroring out even though a working key exists.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const ocr = fs.readFileSync(path.join(root, 'supabase/functions/smart-ocr/index.ts'), 'utf8');
const transcribe = fs.readFileSync(path.join(root, 'supabase/functions/smart-transcribe/index.ts'), 'utf8');

// --- current defaults are the ones actually wired in ---
assert.match(ocr, /GEMINI_VISION_MODEL"\) \|\| "gemini-3\.1-flash-lite"/, 'smart-ocr Gemini primary default drifted');
assert.match(ocr, /gemini-3\.8-flash/, 'smart-ocr Gemini fallback default drifted');
assert.match(ocr, /OPENAI_VISION_MODEL"\) \|\| "gpt-5-mini"/, 'smart-ocr OpenAI default drifted');

assert.match(transcribe, /GEMINI_TRANSCRIBE_MODEL"\) \|\| "gemini-3\.1-flash-lite"/, 'smart-transcribe Gemini primary default drifted');
assert.match(transcribe, /gemini-3\.8-flash/, 'smart-transcribe Gemini fallback default drifted');
assert.match(transcribe, /OPENAI_TRANSCRIBE_MODEL"\) \|\| "gpt-4o-mini-transcribe"/, 'smart-transcribe audio model drifted -- this one was already the cheapest current option, do not change without re-checking pricing');
assert.match(transcribe, /"gpt-5-mini"/, 'smart-transcribe analyzer default drifted');

// --- retired names must not be the live default anywhere (comments referencing
// them as history are fine; matched narrowly so this doesn't just re-detect itself) ---
for (const [label, src] of [['smart-ocr', ocr], ['smart-transcribe', transcribe]]) {
  assert.doesNotMatch(src, /\|\|\s*"gpt-4\.1-mini"/, `${label}: gpt-4.1-mini must not be a live default`);
  assert.doesNotMatch(src, /\[requestedModel,\s*"gemini-3-flash-preview"\]/, `${label}: gemini-3-flash-preview must not be a live fallback`);
}

// --- resilience: a configured second provider must actually be reachable ---
// Structural check rather than a live call (no network/keys in this test tier):
// asserts the fallthrough exists textually between the Gemini retry loop's exhaustion
// and its final error return, for both files.
for (const [label, src] of [['smart-ocr', ocr], ['smart-transcribe', transcribe]]) {
  const loopEnd = src.indexOf('lastUpstream = upstream;');
  assert.ok(loopEnd > 0, `${label}: could not locate the Gemini retry loop`);
  const afterLoop = src.slice(loopEnd, loopEnd + 400);
  assert.match(
    afterLoop,
    /if \(openAiApiKey\) return tryOpenAi\w+\(\);/,
    `${label}: exhausting the Gemini model list must fall through to a configured OpenAI key, `
    + 'not error out while a working second provider sits unused',
  );
}

console.log('MaalFlow smart-ocr/smart-transcribe provider model + fallback contract: PASS');
