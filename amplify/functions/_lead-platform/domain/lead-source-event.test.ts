import assert from 'node:assert/strict';
import test from 'node:test';
import { createLeadSourceEvent } from './lead-source-event.ts';

test('createLeadSourceEvent normalizes shared source capture fields', () => {
  const event = createLeadSourceEvent({
    attribution: null,
    contactId: 'contact-1',
    email: ' customer@example.com ',
    idempotencyKey: 'chat:cthr_123',
    journeyId: 'journey-1',
    leadRecordId: 'lead-1',
    locale: ' en ',
    message: ' Seat repair ',
    name: ' Customer ',
    occurredAtMs: 1_000,
    origin: ' chat:auto ',
    pageUrl: ' https://example.test/contact ',
    phone: ' (408) 555-0101 ',
    service: ' seat-repair ',
    siteLabel: ' craigs.autos ',
    source: 'chat',
    sourceEventId: 'cthr_123',
    userId: ' anon-1 ',
    vehicle: ' Toyota ',
  });

  assert.equal(event.source_event_id, 'cthr_123');
  assert.equal(event.source, 'chat');
  assert.equal(event.idempotency_key, 'chat:cthr_123');
  assert.equal(event.email, 'customer@example.com');
  assert.equal(event.locale, 'en');
  assert.equal(event.vehicle, 'Toyota');
});
