import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeE164Phone,
  normalizeGoogleEnhancedEmail,
  normalizeYelpPhone,
  sha256Hex,
} from './identity-normalization.ts';

test('normalizeGoogleEnhancedEmail applies Google enhanced-conversion Gmail rules only to Gmail domains', () => {
  assert.equal(
    normalizeGoogleEnhancedEmail(' Jane.Doe+Boat@googlemail.com '),
    'janedoe@googlemail.com',
  );
  assert.equal(normalizeGoogleEnhancedEmail('J.User+Boat@gmail.com'), 'juser@gmail.com');
  assert.equal(
    normalizeGoogleEnhancedEmail('user.name+boat@example.com'),
    'user.name+boat@example.com',
  );
});

test('phone normalization follows provider-specific expectations', () => {
  assert.equal(normalizeE164Phone('(408) 555-0100'), '+14085550100');
  assert.equal(normalizeE164Phone('14085550100'), '+14085550100');
  assert.equal(normalizeYelpPhone('+1 (408) 555-0100'), '14085550100');
  assert.equal(normalizeYelpPhone('4085550100'), '14085550100');
  assert.equal(normalizeYelpPhone('+44 20 7946 0958'), null);
});

test('sha256Hex returns deterministic lowercase hex', () => {
  assert.equal(
    sha256Hex('person@example.com'),
    '542d240129883c019e106e3b1b2d3f3cb3537c43c425364de8e951d5a3083345',
  );
});
