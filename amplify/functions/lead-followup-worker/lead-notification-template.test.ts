import assert from 'node:assert/strict';
import test from 'node:test';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import {
  buildLeadNotificationEmailContent,
  buildLeadNotificationResultLabel,
} from './lead-notification-template.ts';

function makeRecord(overrides: Partial<LeadFollowupWorkItem> = {}): LeadFollowupWorkItem {
  return {
    ai_error: '',
    ai_model: 'gpt-test',
    ai_status: 'generated',
    attachment_count: 2,
    attachments: [],
    attribution: null,
    capture_channel: 'email',
    contact_id: 'contact-1',
    created_at: 1_000,
    customer_email_error: '',
    customer_email_message_id: 'customer-email-1',
    email: 'customer@example.com',
    email_body: 'Please send 2-4 photos.',
    email_status: 'sent',
    email_subject: 'Re: Seat repair',
    email_thread_key: 'thread-1',
    followup_work_id: 'followup-work-1',
    idempotency_key: 'email:thread-1',
    inbound_attachment_count: 3,
    inbound_email_s3_bucket: 'bucket',
    inbound_email_s3_key: 'raw/message',
    inbound_email_subject: 'Seat repair',
    inbound_photo_attachment_count: 2,
    inbound_route_status: 'matched',
    journey_id: 'journey-1',
    lead_notification_error: '',
    lead_notification_message_id: '',
    lead_notification_status: null,
    lead_record_id: 'lead-record-1',
    locale: 'en',
    message: 'Driver seat has <tear> & needs help.',
    missing_info: ['photos', 'seat material'],
    name: 'Customer',
    origin: 'email',
    outreach_channel: 'email',
    outreach_result: 'email_sent',
    page_url: '',
    phone: '(408) 555-0101',
    photo_attachment_count: 2,
    service: 'seat repair',
    site_label: 'craigs.autos',
    sms_body: 'Please text photos.',
    sms_error: '',
    sms_message_id: '',
    sms_status: 'skipped',
    source_event_id: 'source-event-1',
    source_message_id: '<message@example.com>',
    source_references: '',
    status: 'processing',
    ttl: 999_999,
    unsupported_attachment_count: 1,
    updated_at: 1_000,
    user_id: 'anon-user',
    vehicle: '2010 VW Eos',
    ...overrides,
  };
}

test('lead notification content includes the operational lead context', () => {
  const message = buildLeadNotificationEmailContent({
    record: makeRecord(),
    resultLabel: buildLeadNotificationResultLabel('email_sent', false),
  });

  assert.equal(message.subject, '[Internal] New quote lead: 2010 VW Eos - seat repair');
  assert.match(message.text, /Capture channel: email/);
  assert.match(message.text, /Photos: 2 accepted, 1 unsupported/);
  assert.match(message.text, /Missing info: photos, seat material/);
  assert.match(message.text, /Customer message:\nDriver seat has <tear> & needs help\./);
  assert.match(message.text, /Email draft body:\nPlease send 2-4 photos\./);
  assert.match(message.html, /Driver seat has &lt;tear&gt; &amp; needs help\./);
  assert.doesNotMatch(message.text, /owner/i);
  assert.doesNotMatch(message.html, /owner/i);
});
