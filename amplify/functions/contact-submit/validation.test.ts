import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContactSubmitRequest } from './request.ts';
import { validateContactSubmitRequest } from './validation.ts';

function makeRequest(overrides: Partial<ContactSubmitRequest> = {}): ContactSubmitRequest {
  return {
    attribution: null,
    clientEventId: null,
    company: '',
    effectivePageUrl: 'https://craigs.autos/en/request-a-quote',
    email: 'customer@example.com',
    isSmokeTest: false,
    journeyId: null,
    locale: 'en',
    message: 'Driver seat tear',
    name: 'Customer',
    origin: 'https://craigs.autos',
    pageUrl: 'https://craigs.autos/en/request-a-quote',
    phone: '(408) 555-0101',
    service: 'seat-repair',
    userId: 'anon-user',
    vehicle: '1969 Camaro',
    ...overrides,
  };
}

test('validateContactSubmitRequest accepts either phone or email with a name', () => {
  assert.deepEqual(validateContactSubmitRequest(makeRequest({ email: '' })), { ok: true });
  assert.deepEqual(validateContactSubmitRequest(makeRequest({ phone: '' })), { ok: true });
});

test('validateContactSubmitRequest treats honeypot submissions as benign bot traffic', () => {
  assert.deepEqual(validateContactSubmitRequest(makeRequest({ company: 'bot field' })), {
    ok: false,
    kind: 'honeypot',
    statusCode: 202,
    body: { ok: true },
  });
});

test('validateContactSubmitRequest rejects missing contact methods', () => {
  const result = validateContactSubmitRequest(makeRequest({ email: '', phone: '' }));

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 400);
  assert.match(JSON.stringify(result.body), /phone number or email/);
});

test('validateContactSubmitRequest rejects malformed email and phone values', () => {
  assert.deepEqual(validateContactSubmitRequest(makeRequest({ email: 'not-email' })), {
    ok: false,
    kind: 'invalid',
    statusCode: 400,
    body: { error: 'Email is invalid.' },
  });
  assert.deepEqual(validateContactSubmitRequest(makeRequest({ phone: '123' })), {
    ok: false,
    kind: 'invalid',
    statusCode: 400,
    body: { error: 'Phone number is invalid.' },
  });
});
