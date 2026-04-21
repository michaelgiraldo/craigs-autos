import assert from 'node:assert/strict';
import test from 'node:test';
import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';
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

  const handoffEvents = bundle.events.filter(
    (event) => event.event_name === LEAD_EVENTS.chatHandoffCompleted,
  );
  assert.equal(handoffEvents.length, 1);
});

test('buildChatLeadBundle records the customer chat action on the lead read model', () => {
  const bundle = buildChatLeadBundle({
    threadId: 'thread-3',
    occurredAt: 1_000,
    journeyId: 'journey-chat-action',
    name: 'Morgan Example',
    email: 'morgan@example.com',
  });

  assert.equal(bundle.journey.first_action, 'chat_first_message_sent');
  assert.equal(bundle.journey.latest_action, 'chat_first_message_sent');
  assert.deepEqual(bundle.journey.action_types, ['chat_first_message_sent']);
  assert.equal(bundle.journey.action_count, 1);
  assert.equal(bundle.leadRecord?.first_action, 'chat_first_message_sent');
  assert.equal(bundle.leadRecord?.latest_action, 'chat_first_message_sent');
  assert.deepEqual(bundle.leadRecord?.action_types, ['chat_first_message_sent']);
  assert.equal(bundle.leadRecord?.action_count, 1);
});
