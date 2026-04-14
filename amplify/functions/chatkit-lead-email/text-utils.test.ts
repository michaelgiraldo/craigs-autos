import assert from 'node:assert/strict';
import test from 'node:test';
import { phoneToE164, phoneToTelHref } from './text-utils.ts';

test('phoneToE164 normalizes a 10-digit US phone number', () => {
  assert.equal(phoneToE164('(408) 555-0101'), '+14085550101');
});

test('phoneToE164 preserves an 11-digit NANP number with country code', () => {
  assert.equal(phoneToE164('1-408-555-0101'), '+14085550101');
});

test('phoneToTelHref uses the E.164-normalized value', () => {
  assert.equal(phoneToTelHref('(408) 555-0101'), 'tel:+14085550101');
});
