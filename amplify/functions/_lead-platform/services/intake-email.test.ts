import assert from 'node:assert/strict';
import test from 'node:test';
import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';
import { buildEmailLeadBundle } from './intake-email.ts';

test('buildEmailLeadBundle uses a stable accepted event id for the same message', () => {
  const first = buildEmailLeadBundle({
    email: 'customer@example.com',
    emailIntakeId: 'email_1',
    messageId: '<message-1@example.com>',
    occurredAt: 1_000,
    threadKey: 'email:<message-1@example.com>',
  });
  const second = buildEmailLeadBundle({
    email: 'customer@example.com',
    emailIntakeId: 'email_1',
    messageId: '<message-1@example.com>',
    occurredAt: 2_000,
    threadKey: 'email:<message-1@example.com>',
  });

  assert.equal(first.events[0]?.event_name, LEAD_EVENTS.emailIntakeAccepted);
  assert.equal(first.events[0]?.client_event_id, second.events[0]?.client_event_id);
  assert.equal(first.events[0]?.journey_event_id, second.events[0]?.journey_event_id);
  assert.equal(first.events[0]?.event_sort_key, second.events[0]?.event_sort_key);
});

test('buildEmailLeadBundle keeps caller-provided event ids authoritative', () => {
  const bundle = buildEmailLeadBundle({
    clientEventId: 'email_intake_operator_replay',
    email: 'customer@example.com',
    emailIntakeId: 'email_1',
    messageId: '<message-1@example.com>',
    occurredAt: 1_000,
    threadKey: 'email:<message-1@example.com>',
  });

  assert.equal(bundle.events[0]?.client_event_id, 'email_intake_operator_replay');
});
