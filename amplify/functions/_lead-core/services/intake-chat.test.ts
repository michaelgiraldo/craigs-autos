import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChatLeadBundle } from './intake-chat.ts';

test('buildChatLeadBundle uses the journey as the stable lead record identity', () => {
  const first = buildChatLeadBundle({
    threadId: 'thread-1',
    occurredAt: 1_000,
    journeyId: 'journey-chat-shared',
    name: 'Taylor Example',
    email: 'taylor@example.com',
  });
  const second = buildChatLeadBundle({
    threadId: 'thread-1',
    occurredAt: 2_000,
    journeyId: 'journey-chat-shared',
    name: 'Taylor Example',
    email: 'taylor@example.com',
  });

  assert.ok(first.leadRecord);
  assert.ok(second.leadRecord);
  assert.equal(first.leadRecord?.lead_record_id, second.leadRecord?.lead_record_id);
});

test('buildChatLeadBundle emits a single handoff success event in the promotion bundle', () => {
  const bundle = buildChatLeadBundle({
    threadId: 'thread-2',
    occurredAt: 1_000,
    journeyId: 'journey-chat-event',
    name: 'Jordan Example',
    email: 'jordan@example.com',
  });

  const handoffEvents = bundle.events.filter((event) => event.event_name === 'lead_chat_handoff_sent');
  assert.equal(handoffEvents.length, 1);
});
