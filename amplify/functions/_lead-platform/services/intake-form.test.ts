import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFormLeadBundle } from './intake-form.ts';

test('buildFormLeadBundle reuses the same lead record for the same journey', () => {
  const first = buildFormLeadBundle({
    quoteRequestId: 'quote-request-1',
    occurredAt: 1_000,
    journeyId: 'journey-shared',
    name: 'Alex Example',
    email: 'alex@example.com',
  });
  const second = buildFormLeadBundle({
    quoteRequestId: 'quote-request-2',
    occurredAt: 2_000,
    journeyId: 'journey-shared',
    name: 'Alex Example',
    email: 'alex@example.com',
  });

  assert.ok(first.leadRecord);
  assert.ok(second.leadRecord);
  assert.equal(first.leadRecord?.lead_record_id, second.leadRecord?.lead_record_id);
  assert.equal(first.journey.lead_record_id, first.leadRecord?.lead_record_id ?? null);
  assert.equal(second.journey.lead_record_id, second.leadRecord?.lead_record_id ?? null);
});

test('buildFormLeadBundle derives customer language from the form locale', () => {
  const bundle = buildFormLeadBundle({
    quoteRequestId: 'quote-request-es',
    occurredAt: 1_000,
    locale: 'es',
    name: 'Alex Example',
    email: 'alex@example.com',
  });

  assert.equal(bundle.leadRecord?.customer_language, 'es');
});
