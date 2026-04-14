import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLeadTitle, normalizeEmail, normalizePhoneE164, splitDisplayName } from './normalize.ts';

test('normalizePhoneE164 keeps NANP normalization aligned for lead-contact identity', () => {
  assert.equal(normalizePhoneE164('(408) 555-0101'), '+14085550101');
  assert.equal(normalizePhoneE164('1-408-555-0101'), '+14085550101');
});

test('splitDisplayName preserves multi-part last names', () => {
  assert.deepEqual(splitDisplayName(' Abby De Los Reyes '), {
    displayName: 'Abby De Los Reyes',
    firstName: 'Abby',
    lastName: 'De Los Reyes',
  });
});

test('buildLeadTitle prefers structured vehicle and service data', () => {
  assert.equal(
    buildLeadTitle({
      channel: 'form',
      vehicle: '2019 Acura RDX A-Spec',
      service: 'full-restoration',
      message: 'Purple seat conversion',
    }),
    'full-restoration · 2019 Acura RDX A-Spec',
  );
  assert.equal(normalizeEmail(' CUSTOMER@Example.com '), 'customer@example.com');
});
