import assert from 'node:assert/strict';
import {
  NUMBER_INPUT_FORMATS,
  parseMoneyInput,
  parseNumberInput,
  preserveNumberInputDraft,
  resolveSystemNumberInputFormat,
} from '../src/lib/numberInput.js';

const valid = (input, options, expected) => {
  const result = parseMoneyInput(input, options);
  assert.equal(result.ok, true, `${input} should parse: ${result.reason}`);
  assert.equal(result.value, expected, `${input} should preserve its amount`);
};

const invalid = (input, options, reason) => {
  const result = parseMoneyInput(input, options);
  assert.equal(result.ok, false, `${input} should be rejected`);
  assert.equal(result.reason, reason, `${input} should explain why it was rejected`);
};

const iq = { currency: 'IQD' };
valid('1.500', { ...iq, format: NUMBER_INPUT_FORMATS.DOT_DECIMAL }, 1.5);
valid('0.500', { ...iq, format: NUMBER_INPUT_FORMATS.DOT_DECIMAL }, 0.5);
valid('1,500', { ...iq, format: NUMBER_INPUT_FORMATS.DOT_DECIMAL }, 1500);
valid('1,234.56', { ...iq, format: NUMBER_INPUT_FORMATS.DOT_DECIMAL }, 1234.56);
invalid('1.234,56', { ...iq, format: NUMBER_INPUT_FORMATS.DOT_DECIMAL }, 'invalid_separator');

valid('1,500', { ...iq, format: NUMBER_INPUT_FORMATS.COMMA_DECIMAL }, 1.5);
valid('0,500', { ...iq, format: NUMBER_INPUT_FORMATS.COMMA_DECIMAL }, 0.5);
valid('1.500', { ...iq, format: NUMBER_INPUT_FORMATS.COMMA_DECIMAL }, 1500);
valid('1.234,56', { ...iq, format: NUMBER_INPUT_FORMATS.COMMA_DECIMAL }, 1234.56);
invalid('1,234.56', { ...iq, format: NUMBER_INPUT_FORMATS.COMMA_DECIMAL }, 'invalid_separator');

valid('١٬٥٠٠', { ...iq, format: NUMBER_INPUT_FORMATS.ARABIC_NATIVE }, 1500);
valid('١٫٥٠٠', { ...iq, format: NUMBER_INPUT_FORMATS.ARABIC_NATIVE }, 1.5);
valid('١٢٣٤٫٥٦', { ...iq, format: NUMBER_INPUT_FORMATS.ARABIC_NATIVE }, 1234.56);
valid('1٬500٫25', { ...iq, format: NUMBER_INPUT_FORMATS.ARABIC_NATIVE }, 1500.25);
invalid('١,٥٠٠', { ...iq, format: NUMBER_INPUT_FORMATS.ARABIC_NATIVE }, 'invalid_separator');

// Explicit Arabic separators retain their meaning even when a Latin profile
// is selected; this makes pasted Arabic figures safe and predictable.
valid('١٫٥٠٠', { ...iq, format: NUMBER_INPUT_FORMATS.DOT_DECIMAL }, 1.5);
valid('١٬٥٠٠', { ...iq, format: NUMBER_INPUT_FORMATS.COMMA_DECIMAL }, 1500);

invalid('1.2345', { ...iq, format: NUMBER_INPUT_FORMATS.DOT_DECIMAL }, 'too_many_fraction_digits');
valid('1.234', { ...iq, format: NUMBER_INPUT_FORMATS.DOT_DECIMAL }, 1.234);
invalid('1.234', { currency: 'USD', format: NUMBER_INPUT_FORMATS.DOT_DECIMAL }, 'too_many_fraction_digits');
invalid('1.2', { currency: 'JPY', format: NUMBER_INPUT_FORMATS.DOT_DECIMAL }, 'too_many_fraction_digits');
invalid('--1', { ...iq, format: NUMBER_INPUT_FORMATS.DOT_DECIMAL }, 'invalid_sign');
invalid('1..5', { ...iq, format: NUMBER_INPUT_FORMATS.DOT_DECIMAL }, 'invalid_separator');
invalid('abc', { ...iq, format: NUMBER_INPUT_FORMATS.DOT_DECIMAL }, 'invalid_character');
assert.equal(Number.isNaN(parseNumberInput('abc', { ...iq, format: NUMBER_INPUT_FORMATS.DOT_DECIMAL })), true, 'Invalid input must never become zero');
assert.equal(preserveNumberInputDraft('١٫'), '١٫', 'Draft text must remain untouched while typing');

assert.equal(resolveSystemNumberInputFormat('ar-IQ'), NUMBER_INPUT_FORMATS.ARABIC_NATIVE);
assert.equal(resolveSystemNumberInputFormat('en-IQ'), NUMBER_INPUT_FORMATS.DOT_DECIMAL);
assert.equal(resolveSystemNumberInputFormat('ckb-IQ'), NUMBER_INPUT_FORMATS.ARABIC_NATIVE);
assert.equal(resolveSystemNumberInputFormat('ar-IQ-u-nu-latn'), NUMBER_INPUT_FORMATS.DOT_DECIMAL);
assert.equal(resolveSystemNumberInputFormat('de-DE'), NUMBER_INPUT_FORMATS.COMMA_DECIMAL);
assert.equal(resolveSystemNumberInputFormat('fr-FR'), NUMBER_INPUT_FORMATS.COMMA_DECIMAL);

console.log('MYFI number input contract: PASSED');
