import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuoteFollowupHandler } from './handler.ts';
import type { QuoteSubmissionRecord } from '../_shared/quote-submissions.ts';

function makeRecord(overrides: Partial<QuoteSubmissionRecord> = {}): QuoteSubmissionRecord {
  return {
    submission_id: 'submission-1',
    status: 'queued',
    created_at: 1_000,
    updated_at: 1_000,
    ttl: 999_999,
    name: 'Michael',
    email: 'michael@example.com',
    phone: '(408) 555-0101',
    vehicle: '2018 Toyota Camry',
    service: 'seat-repair',
    message: 'Driver seat tear',
    origin: 'https://cesar.autos/contact',
    site_label: 'cesar.autos',
    journey_id: 'journey-1',
    lead_record_id: 'lead-record-1',
    contact_id: 'contact-1',
    locale: 'en',
    page_url: 'https://cesar.autos/contact',
    user_id: 'anon-user',
    attribution: null,
    ai_status: null,
    ai_model: '',
    ai_error: '',
    sms_body: '',
    email_subject: '',
    email_body: '',
    missing_info: [],
    sms_status: null,
    sms_message_id: '',
    sms_error: '',
    email_status: null,
    customer_email_message_id: '',
    customer_email_error: '',
    outreach_channel: null,
    outreach_result: null,
    owner_email_status: null,
    owner_email_message_id: '',
    owner_email_error: '',
    ...overrides,
  };
}

test('quote-followup sends SMS first and still notifies the owner', async () => {
  const saved: QuoteSubmissionRecord[] = [];
  let current = makeRecord();

  const handler = createQuoteFollowupHandler({
    configValid: true,
    smsAutomationEnabled: true,
    nowEpochSeconds: () => 2_000,
    getSubmission: async () => current,
    acquireLease: async () => true,
    saveSubmission: async (record) => {
      current = { ...record };
      saved.push({ ...record });
    },
    generateDrafts: async () => ({
      aiError: '',
      aiModel: 'gpt-test',
      aiStatus: 'generated',
      drafts: {
        smsBody: 'Please text us 2-4 photos.',
        emailSubject: 'ABC Upholstery - next steps',
        emailBody: 'Please email us 2-4 photos.',
        missingInfo: ['photos'],
      },
    }),
    sendSms: async () => ({ id: 'sms-123', status: 'sent' }),
    sendCustomerEmail: async () => ({ messageId: 'email-123' }),
    sendOwnerEmail: async () => ({ messageId: 'owner-123' }),
  });

  const result = await handler({ submission_id: 'submission-1' });

  assert.equal(result.statusCode, 200);
  assert.equal(current.sms_status, 'sent');
  assert.equal(current.email_status, 'skipped');
  assert.equal(current.owner_email_status, 'sent');
  assert.equal(current.outreach_result, 'sms_sent');
  assert.equal(saved.some((record) => record.sms_message_id === 'sms-123'), true);
});

test('quote-followup falls back to customer email when phone is missing', async () => {
  let current = makeRecord({ phone: '', email: 'customer@example.com' });

  const handler = createQuoteFollowupHandler({
    configValid: true,
    smsAutomationEnabled: true,
    nowEpochSeconds: () => 3_000,
    getSubmission: async () => current,
    acquireLease: async () => true,
    saveSubmission: async (record) => {
      current = { ...record };
    },
    generateDrafts: async () => ({
      aiError: '',
      aiModel: 'gpt-test',
      aiStatus: 'generated',
      drafts: {
        smsBody: 'Please text us 2-4 photos.',
        emailSubject: 'ABC Upholstery - next steps',
        emailBody: 'Please email us 2-4 photos.',
        missingInfo: [],
      },
    }),
    sendSms: async () => ({ id: 'sms-should-not-send', status: 'sent' }),
    sendCustomerEmail: async () => ({ messageId: 'customer-email-123' }),
    sendOwnerEmail: async () => ({ messageId: 'owner-email-123' }),
  });

  const result = await handler({ submission_id: 'submission-1' });

  assert.equal(result.statusCode, 200);
  assert.equal(current.sms_status, 'skipped');
  assert.equal(current.email_status, 'sent');
  assert.equal(current.outreach_result, 'email_sent_fallback');
});

test('quote-followup records SMS failure when no email fallback exists', async () => {
  let current = makeRecord({ email: '' });

  const handler = createQuoteFollowupHandler({
    configValid: true,
    smsAutomationEnabled: true,
    nowEpochSeconds: () => 4_000,
    getSubmission: async () => current,
    acquireLease: async () => true,
    saveSubmission: async (record) => {
      current = { ...record };
    },
    generateDrafts: async () => ({
      aiError: '',
      aiModel: 'gpt-test',
      aiStatus: 'generated',
      drafts: {
        smsBody: 'Please text us 2-4 photos.',
        emailSubject: 'ABC Upholstery - next steps',
        emailBody: 'Please email us 2-4 photos.',
        missingInfo: [],
      },
    }),
    sendSms: async () => {
      throw new Error('QUO failed');
    },
    sendCustomerEmail: async () => ({ messageId: 'unused' }),
    sendOwnerEmail: async () => ({ messageId: 'owner-email-123' }),
  });

  const result = await handler({ submission_id: 'submission-1' });

  assert.equal(result.statusCode, 200);
  assert.equal(current.sms_status, 'failed');
  assert.equal(current.email_status, 'skipped');
  assert.equal(current.outreach_result, 'sms_failed_no_email_fallback');
});

test('quote-followup skips duplicate sends when the submission is already complete', async () => {
  const handler = createQuoteFollowupHandler({
    configValid: true,
    smsAutomationEnabled: true,
    nowEpochSeconds: () => 5_000,
    getSubmission: async () => makeRecord({ status: 'completed' }),
    acquireLease: async () => true,
    saveSubmission: async () => undefined,
    generateDrafts: async () => {
      throw new Error('should not run');
    },
    sendSms: async () => {
      throw new Error('should not run');
    },
    sendCustomerEmail: async () => {
      throw new Error('should not run');
    },
    sendOwnerEmail: async () => {
      throw new Error('should not run');
    },
  });

  const result = await handler({ submission_id: 'submission-1' });

  assert.equal(result.statusCode, 200);
  assert.match(result.body, /already_completed/);
});

test('quote-followup marks phone-only submissions for manual follow-up when SMS automation is off', async () => {
  let current = makeRecord({ email: '' });

  const handler = createQuoteFollowupHandler({
    configValid: true,
    smsAutomationEnabled: false,
    nowEpochSeconds: () => 6_000,
    getSubmission: async () => current,
    acquireLease: async () => true,
    saveSubmission: async (record) => {
      current = { ...record };
    },
    generateDrafts: async () => ({
      aiError: '',
      aiModel: 'gpt-test',
      aiStatus: 'generated',
      drafts: {
        smsBody: 'Please text us 2-4 photos.',
        emailSubject: 'Craig\'s Auto Upholstery - next steps',
        emailBody: 'Please email us 2-4 photos.',
        missingInfo: [],
      },
    }),
    sendSms: async () => ({ id: 'sms-should-not-send', status: 'sent' }),
    sendCustomerEmail: async () => ({ messageId: 'unused-email' }),
    sendOwnerEmail: async () => ({ messageId: 'owner-email-123' }),
  });

  const result = await handler({ submission_id: 'submission-1' });

  assert.equal(result.statusCode, 200);
  assert.equal(current.sms_status, 'skipped');
  assert.equal(current.sms_error, 'manual_followup_required');
  assert.equal(current.email_status, 'skipped');
  assert.equal(current.outreach_result, 'manual_followup_required');
});
