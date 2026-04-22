import assert from 'node:assert/strict';
import test from 'node:test';
import type { SendEmailCommandInput, SESv2Client } from '@aws-sdk/client-sesv2';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import { createSesLeadNotificationEmailSender } from './lead-notification-email.ts';

const INTERNAL_LEAD_INBOX_EMAIL = 'leads@craigs.autos';

function createFakeSes(sent: SendEmailCommandInput[]): SESv2Client {
  return {
    send: async (command: { input: SendEmailCommandInput }) => {
      sent.push(command.input);
      return { MessageId: 'ses-message-1' };
    },
  } as unknown as SESv2Client;
}

function makeRecord(overrides: Partial<LeadFollowupWorkItem> = {}): LeadFollowupWorkItem {
  return {
    ai_error: '',
    ai_model: 'gpt-test',
    ai_status: 'generated',
    attachment_count: 0,
    attachments: [],
    attribution: null,
    capture_channel: 'chat',
    chat_thread_id: 'cthr_test',
    chat_thread_title: 'Seat repair',
    contact_id: 'contact-1',
    created_at: 1_000,
    customer_email_error: '',
    customer_email_message_id: 'customer-email-1',
    email: 'customer@example.com',
    email_body: 'Please send 2-4 photos.',
    email_status: 'sent',
    email_subject: 'Next steps',
    email_thread_key: '',
    customer_language: 'English',
    followup_work_id: 'followup-work-1',
    idempotency_key: 'chat:thread-1',
    inbound_attachment_count: 0,
    inbound_email_s3_bucket: '',
    inbound_email_s3_key: '',
    inbound_email_subject: '',
    inbound_photo_attachment_count: 0,
    inbound_route_status: '',
    journey_id: 'journey-1',
    lead_record_id: 'lead-record-1',
    locale: 'en',
    message: 'Seat repair request',
    missing_info: [],
    name: 'Customer',
    origin: 'chat',
    outreach_channel: 'email',
    outreach_result: 'email_sent_fallback',
    lead_notification_error: '',
    lead_notification_message_id: '',
    lead_notification_status: null,
    page_url: 'https://craigs.autos/en/request-a-quote/',
    phone: '',
    photo_attachment_count: 0,
    service: 'seat repair',
    site_label: 'craigs.autos',
    sms_body: '',
    sms_error: '',
    sms_message_id: '',
    sms_status: 'skipped',
    source_event_id: 'source-event-1',
    source_message_id: '',
    source_references: '',
    status: 'processing',
    ttl: 999_999,
    unsupported_attachment_count: 0,
    updated_at: 1_000,
    user_id: 'anon-user',
    vehicle: '2010 VW Eos',
    ...overrides,
  };
}

test('internal lead notifications use the internal lead inbox identity', async () => {
  const sent: SendEmailCommandInput[] = [];
  const sendLeadNotificationEmail = createSesLeadNotificationEmailSender({
    fromEmail: INTERNAL_LEAD_INBOX_EMAIL,
    smsProviderReady: false,
    ses: createFakeSes(sent),
    toEmail: INTERNAL_LEAD_INBOX_EMAIL,
  });

  await sendLeadNotificationEmail({ record: makeRecord() });

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.FromEmailAddress, INTERNAL_LEAD_INBOX_EMAIL);
  assert.deepEqual(sent[0]?.Destination?.ToAddresses, [INTERNAL_LEAD_INBOX_EMAIL]);
});

test('internal lead notifications with attachments keep the internal lead inbox raw headers', async () => {
  const sent: SendEmailCommandInput[] = [];
  const sendLeadNotificationEmail = createSesLeadNotificationEmailSender({
    fromEmail: INTERNAL_LEAD_INBOX_EMAIL,
    loadAttachments: async () => [
      {
        content: Buffer.from('photo bytes'),
        contentType: 'image/jpeg',
        filename: 'seat.jpg',
      },
    ],
    smsProviderReady: false,
    ses: createFakeSes(sent),
    toEmail: INTERNAL_LEAD_INBOX_EMAIL,
  });

  await sendLeadNotificationEmail({ record: makeRecord({ photo_attachment_count: 1 }) });

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.FromEmailAddress, INTERNAL_LEAD_INBOX_EMAIL);
  assert.deepEqual(sent[0]?.Destination?.ToAddresses, [INTERNAL_LEAD_INBOX_EMAIL]);

  const raw = Buffer.from(sent[0]?.Content?.Raw?.Data ?? '').toString('utf8');
  assert.match(raw, /^From: leads@craigs\.autos$/m);
  assert.match(raw, /^To: leads@craigs\.autos$/m);
  assert.match(raw, /^X-Craigs-Email-Intake: lead-notification-v1$/m);
  assert.match(raw, /Photos attached to notification: 1/);
  assert.match(raw, /^Content-Type: image\/jpeg; name="seat\.jpg"$/m);
});
