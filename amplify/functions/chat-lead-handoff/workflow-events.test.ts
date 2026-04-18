import assert from 'node:assert/strict';
import test from 'node:test';
import { LEAD_EVENTS } from '../../../shared/lead-event-contract.js';
import { persistChatWorkflowEvent } from './workflow-events.ts';
import type { Journey } from '../_lead-core/domain/journey.ts';

test('persistChatWorkflowEvent does not downgrade a captured journey on workflow error', async () => {
  const puts: Journey[] = [];

  await persistChatWorkflowEvent({
    repos: {
      journeys: {
        getById: async () =>
          ({
            journey_id: 'journey-1',
            lead_record_id: 'lead-record-1',
            contact_id: 'contact-1',
            journey_status: 'captured',
            status_reason: null,
            capture_channel: 'chat',
            first_action: 'chat_first_message_sent',
            latest_action: 'chat_first_message_sent',
            action_types: ['chat_first_message_sent'],
            action_count: 1,
            lead_user_id: 'anon-user',
            thread_id: 'thread-1',
            locale: 'en',
            page_url: 'https://example.test/en',
            page_path: '/en',
            origin: 'https://example.test',
            site_label: 'example.test',
            attribution: null,
            created_at_ms: 1_000,
            updated_at_ms: 2_000,
          }) satisfies Journey,
        put: async (journey: Journey) => {
          puts.push(journey);
        },
      },
      journeyEvents: {
        append: async () => undefined,
      },
    } as never,
    journeyId: 'journey-1',
    threadId: 'thread-1',
    leadRecordId: 'lead-record-1',
    eventName: LEAD_EVENTS.chatHandoffError,
    occurredAtMs: 3_000,
    recordedAtMs: 3_000,
    reason: 'ses_failed',
    locale: 'en',
    pageUrl: 'https://example.test/en',
    userId: 'anon-user',
    attribution: null,
  });

  assert.equal(puts.length, 1);
  assert.equal(puts[0]?.journey_status, 'captured');
  assert.equal(puts[0]?.status_reason, null);
});
