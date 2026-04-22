import assert from 'node:assert/strict';
import test from 'node:test';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import {
  StaleFollowupWorkLeaseError,
  createDynamoLeadFollowupWorkStore,
} from './followup-work-store.ts';

function makeRecord(overrides: Partial<LeadFollowupWorkItem> = {}): LeadFollowupWorkItem {
  return {
    followup_work_id: 'followup-work-1',
    idempotency_key: 'form:followup-work-1',
    source_event_id: 'source-event-1',
    status: 'completed',
    created_at: 1_000,
    updated_at: 2_000,
    ttl: 999_999,
    name: 'Michael',
    email: 'michael@example.com',
    phone: '(408) 555-0101',
    vehicle: '2018 Toyota Camry',
    service: 'seat-repair',
    message: 'Driver seat tear',
    capture_channel: 'form',
    origin: 'https://example.test/contact',
    site_label: 'example.test',
    journey_id: 'journey-1',
    lead_record_id: 'lead-record-1',
    contact_id: 'contact-1',
    locale: 'en',
    page_url: 'https://example.test/contact',
    user_id: 'anon-user',
    attribution: null,
    ai_status: 'generated',
    ai_model: 'gpt-test',
    ai_error: '',
    sms_body: 'Please send photos.',
    email_subject: 'Next steps',
    email_body: 'Please send photos.',
    missing_info: [],
    sms_status: 'sent',
    sms_message_id: 'sms-1',
    sms_error: '',
    email_status: 'skipped',
    customer_email_message_id: '',
    customer_email_error: '',
    outreach_channel: 'sms',
    outreach_result: 'sms_sent',
    lead_notification_status: 'sent',
    lead_notification_message_id: 'lead-notification-email-1',
    lead_notification_error: '',
    ...overrides,
  };
}

test('LeadFollowupWork store strips undefined fields before saving completed records', async () => {
  const sentCommands: unknown[] = [];
  const db = {
    send: async (command: unknown) => {
      sentCommands.push(command);
      return {};
    },
  };
  const store = createDynamoLeadFollowupWorkStore({
    db: db as never,
    tableName: 'LeadFollowupWork',
  });

  await store.saveFollowupWork(
    makeRecord({
      lease_id: 'lease-1',
      lock_expires_at: undefined,
    }) as LeadFollowupWorkItem & { lease_id: string },
  );

  const command = sentCommands[0];
  assert.equal(command instanceof PutCommand, true);
  assert.equal((command as PutCommand).input.TableName, 'LeadFollowupWork');
  assert.equal('lock_expires_at' in ((command as PutCommand).input.Item ?? {}), false);
  assert.equal((command as PutCommand).input.Item?.lease_id, 'lease-1');
  assert.equal((command as PutCommand).input.ConditionExpression, '#lease_id = :lease_id');
  assert.equal((command as PutCommand).input.ExpressionAttributeValues?.[':lease_id'], 'lease-1');
});

test('LeadFollowupWork store maps failed lease conditions to stale lease errors', async () => {
  const store = createDynamoLeadFollowupWorkStore({
    db: {
      send: async () => {
        const error = new Error('conditional failed') as Error & { name: string };
        error.name = 'ConditionalCheckFailedException';
        throw error;
      },
    } as never,
    tableName: 'LeadFollowupWork',
  });

  await assert.rejects(
    () =>
      store.saveFollowupWork(
        makeRecord({
          lease_id: 'lease-1',
        }) as LeadFollowupWorkItem & { lease_id: string },
      ),
    StaleFollowupWorkLeaseError,
  );
});
