import assert from 'node:assert/strict';
import test from 'node:test';
import type { QuoteRequestSubmitRequest } from './request.ts';
import { validateQuoteRequestSubmitRequest } from './validation.ts';

function makeRequest(
  overrides: Partial<QuoteRequestSubmitRequest> = {},
): QuoteRequestSubmitRequest {
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

test('validateQuoteRequestSubmitRequest accepts either phone or email with a name', () => {
  assert.deepEqual(validateQuoteRequestSubmitRequest(makeRequest({ email: '' })), { ok: true });
  assert.deepEqual(validateQuoteRequestSubmitRequest(makeRequest({ phone: '' })), { ok: true });
});

test('validateQuoteRequestSubmitRequest treats honeypot follow-up works as benign bot traffic', () => {
  assert.deepEqual(validateQuoteRequestSubmitRequest(makeRequest({ company: 'bot field' })), {
    ok: false,
    kind: 'honeypot',
    statusCode: 202,
    body: { ok: true },
  });
});

test('validateQuoteRequestSubmitRequest rejects missing contact methods', () => {
  const result = validateQuoteRequestSubmitRequest(makeRequest({ email: '', phone: '' }));

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 400);
  assert.match(JSON.stringify(result.body), /phone number or email/);
});

test('validateQuoteRequestSubmitRequest rejects malformed email and phone values', () => {
  assert.deepEqual(validateQuoteRequestSubmitRequest(makeRequest({ email: 'not-email' })), {
    ok: false,
    kind: 'invalid',
    statusCode: 400,
    body: { error: 'Email is invalid.' },
  });
  assert.deepEqual(validateQuoteRequestSubmitRequest(makeRequest({ phone: '123' })), {
    ok: false,
    kind: 'invalid',
    statusCode: 400,
    body: { error: 'Phone number is invalid.' },
  });
});
