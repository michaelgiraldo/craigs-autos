import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSmsRecipientE164,
  SMS_CONTENT_MAX_LENGTH,
  validateSmsContent,
} from './sms-policy.ts';

test('normalizeSmsRecipientE164 accepts explicit E.164 and US local numbers', () => {
  assert.equal(normalizeSmsRecipientE164('+14083793820'), '+14083793820');
  assert.equal(normalizeSmsRecipientE164('(408) 379-3820'), '+14083793820');
  assert.equal(normalizeSmsRecipientE164('1 (408) 379-3820'), '+14083793820');
});

test('normalizeSmsRecipientE164 rejects ambiguous non-E.164 numbers', () => {
  assert.equal(normalizeSmsRecipientE164('379-3820'), null);
  assert.equal(normalizeSmsRecipientE164('020 7946 0958'), null);
  assert.equal(normalizeSmsRecipientE164('+123'), null);
});

test('validateSmsContent enforces nonempty content and the Quo SMS limit', () => {
  assert.deepEqual(validateSmsContent(' hello '), { ok: true, content: 'hello' });
  assert.equal(validateSmsContent('   ').ok, false);
  assert.deepEqual(validateSmsContent('x'.repeat(SMS_CONTENT_MAX_LENGTH)), {
    ok: true,
    content: 'x'.repeat(SMS_CONTENT_MAX_LENGTH),
  });
  const tooLong = validateSmsContent('x'.repeat(SMS_CONTENT_MAX_LENGTH + 1));
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.message, /1600/);
});
