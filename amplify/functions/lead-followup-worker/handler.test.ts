import assert from 'node:assert/strict';
import test from 'node:test';
import { createLeadFollowupWorkerHandler } from './handler.ts';
import type { QuoteRequestRecord } from '../_lead-platform/domain/quote-request.ts';

function makeRecord(overrides: Partial<QuoteRequestRecord> = {}): QuoteRequestRecord {
  return {
    quote_request_id: 'quote-request-1',
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
    origin: 'https://example.test/contact',
    site_label: 'example.test',
    journey_id: 'journey-1',
    lead_record_id: 'lead-record-1',
    contact_id: 'contact-1',
    locale: 'en',
    page_url: 'https://example.test/contact',
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

test('lead-followup-worker sends SMS first and still notifies the owner', async () => {
  const saved: QuoteRequestRecord[] = [];
  let current = makeRecord();

  const handler = createLeadFollowupWorkerHandler({
    configValid: true,
    smsAutomationEnabled: true,
    nowEpochSeconds: () => 2_000,
    getQuoteRequest: async () => current,
    acquireLease: async () => true,
    saveQuoteRequest: async (record) => {
      current = { ...record };
      saved.push({ ...record });
    },
    generateDrafts: async () => ({
      aiError: '',
      aiModel: 'gpt-test',
      aiStatus: 'generated',
      drafts: {
        smsBody: 'Please text us 2-4 photos.',
        emailSubject: 'Test Upholstery - next steps',
        emailBody: 'Please email us 2-4 photos.',
        missingInfo: ['photos'],
      },
    }),
    sendSms: async () => ({ id: 'sms-123', status: 'sent' }),
    sendCustomerEmail: async () => ({ messageId: 'email-123' }),
    sendOwnerEmail: async () => ({ messageId: 'owner-123' }),
  });

  const result = await handler({ quote_request_id: 'quote-request-1' });

  assert.equal(result.statusCode, 200);
  assert.equal(current.sms_status, 'sent');
  assert.equal(current.email_status, 'skipped');
  assert.equal(current.owner_email_status, 'sent');
  assert.equal(current.outreach_result, 'sms_sent');
  assert.equal(
    saved.some((record) => record.sms_message_id === 'sms-123'),
    true,
  );
});

test('lead-followup-worker rejects missing quote request ids before touching dependencies', async () => {
  let touched = false;
  const handler = createLeadFollowupWorkerHandler({
    configValid: true,
    smsAutomationEnabled: true,
    nowEpochSeconds: () => 2_000,
    getQuoteRequest: async () => {
      touched = true;
      return makeRecord();
    },
    acquireLease: async () => true,
    saveQuoteRequest: async () => undefined,
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

  const result = await handler({ quote_request_id: '   ' });

  assert.equal(result.statusCode, 400);
  assert.equal(touched, false);
});

test('lead-followup-worker falls back to customer email when phone is missing', async () => {
  let current = makeRecord({ phone: '', email: 'customer@example.com' });

  const handler = createLeadFollowupWorkerHandler({
    configValid: true,
    smsAutomationEnabled: true,
    nowEpochSeconds: () => 3_000,
    getQuoteRequest: async () => current,
    acquireLease: async () => true,
    saveQuoteRequest: async (record) => {
      current = { ...record };
    },
    generateDrafts: async () => ({
      aiError: '',
      aiModel: 'gpt-test',
      aiStatus: 'generated',
      drafts: {
        smsBody: 'Please text us 2-4 photos.',
        emailSubject: 'Test Upholstery - next steps',
        emailBody: 'Please email us 2-4 photos.',
        missingInfo: [],
      },
    }),
    sendSms: async () => ({ id: 'sms-should-not-send', status: 'sent' }),
    sendCustomerEmail: async () => ({ messageId: 'customer-email-123' }),
    sendOwnerEmail: async () => ({ messageId: 'owner-email-123' }),
  });

  const result = await handler({ quote_request_id: 'quote-request-1' });

  assert.equal(result.statusCode, 200);
  assert.equal(current.sms_status, 'skipped');
  assert.equal(current.email_status, 'sent');
  assert.equal(current.outreach_result, 'email_sent_fallback');
});

test('lead-followup-worker sends email first for inbound email leads and cleans raw source', async () => {
  let current = makeRecord({
    capture_channel: 'email',
    preferred_outreach_channel: 'email',
    phone: '(408) 555-0101',
    email: 'customer@example.com',
    email_subject: 'Re: 2014 Honda Accord driver seat tear repair',
    email_body: 'Thanks for sending the photos. Victor',
    inbound_email_subject: '2014 Honda Accord driver seat tear repair estimate',
    inbound_email_s3_bucket: 'raw-email-bucket',
    inbound_email_s3_key: 'raw/message-id',
    source_message_id: '<customer-message@example.com>',
  });
  let smsTouched = false;
  const emailedRecords: QuoteRequestRecord[] = [];
  const emailedSubjects: string[] = [];
  const cleanedRecords: QuoteRequestRecord[] = [];

  const handler = createLeadFollowupWorkerHandler({
    configValid: true,
    smsAutomationEnabled: true,
    nowEpochSeconds: () => 3_500,
    getQuoteRequest: async () => current,
    acquireLease: async () => true,
    saveQuoteRequest: async (record) => {
      current = { ...record };
    },
    generateDrafts: async () => {
      throw new Error('draft generation should be skipped for pre-drafted email leads');
    },
    sendSms: async () => {
      smsTouched = true;
      return { id: 'sms-should-not-send', status: 'sent' };
    },
    sendCustomerEmail: async ({ record, subject }) => {
      emailedRecords.push(record);
      emailedSubjects.push(subject);
      return { messageId: 'customer-email-123' };
    },
    sendOwnerEmail: async () => ({ messageId: 'owner-email-123' }),
    cleanupInboundEmailSource: async (record) => {
      cleanedRecords.push(record);
    },
  });

  const result = await handler({ quote_request_id: 'quote-request-1' });

  assert.equal(result.statusCode, 200);
  assert.equal(smsTouched, false);
  assert.equal(current.sms_status, 'skipped');
  assert.equal(current.email_status, 'sent');
  assert.equal(current.outreach_channel, 'email');
  assert.equal(current.outreach_result, 'email_sent');
  assert.equal(emailedRecords[0]?.source_message_id, '<customer-message@example.com>');
  assert.equal(emailedSubjects[0], 'Re: 2014 Honda Accord driver seat tear repair estimate');
  assert.equal(current.email_subject, 'Re: 2014 Honda Accord driver seat tear repair estimate');
  assert.equal(cleanedRecords[0]?.inbound_email_s3_key, 'raw/message-id');
});

test('lead-followup-worker preserves inbound email subject for generated email replies', async () => {
  let current = makeRecord({
    capture_channel: 'email',
    preferred_outreach_channel: 'email',
    phone: '',
    email: 'customer@example.com',
    inbound_email_subject: '2016 Toyota Tacoma. Quote for front seat upholstery repair',
    source_message_id: '<customer-message@example.com>',
  });
  const customerEmailSubjects: string[] = [];

  const handler = createLeadFollowupWorkerHandler({
    configValid: true,
    smsAutomationEnabled: true,
    nowEpochSeconds: () => 3_600,
    getQuoteRequest: async () => current,
    acquireLease: async () => true,
    saveQuoteRequest: async (record) => {
      current = { ...record };
    },
    generateDrafts: async () => ({
      aiError: '',
      aiModel: 'gpt-test',
      aiStatus: 'generated',
      drafts: {
        smsBody: 'Please text us 2-4 photos.',
        emailSubject: 'Re: AI rewritten subject',
        emailBody: 'Thanks for sending the photos. Victor',
        missingInfo: [],
      },
    }),
    sendSms: async () => ({ id: 'sms-should-not-send', status: 'sent' }),
    sendCustomerEmail: async ({ subject, record }) => {
      customerEmailSubjects.push(subject);
      assert.equal(
        record.email_subject,
        'Re: 2016 Toyota Tacoma. Quote for front seat upholstery repair',
      );
      return { messageId: 'customer-email-123' };
    },
    sendOwnerEmail: async () => ({ messageId: 'owner-email-123' }),
  });

  const result = await handler({ quote_request_id: 'quote-request-1' });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(customerEmailSubjects, [
    'Re: 2016 Toyota Tacoma. Quote for front seat upholstery repair',
  ]);
  assert.equal(
    current.email_subject,
    'Re: 2016 Toyota Tacoma. Quote for front seat upholstery repair',
  );
  assert.equal(current.email_status, 'sent');
});

test('lead-followup-worker records SMS failure when no email fallback exists', async () => {
  let current = makeRecord({ email: '' });

  const handler = createLeadFollowupWorkerHandler({
    configValid: true,
    smsAutomationEnabled: true,
    nowEpochSeconds: () => 4_000,
    getQuoteRequest: async () => current,
    acquireLease: async () => true,
    saveQuoteRequest: async (record) => {
      current = { ...record };
    },
    generateDrafts: async () => ({
      aiError: '',
      aiModel: 'gpt-test',
      aiStatus: 'generated',
      drafts: {
        smsBody: 'Please text us 2-4 photos.',
        emailSubject: 'Test Upholstery - next steps',
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

  const result = await handler({ quote_request_id: 'quote-request-1' });

  assert.equal(result.statusCode, 200);
  assert.equal(current.sms_status, 'failed');
  assert.equal(current.email_status, 'skipped');
  assert.equal(current.outreach_result, 'sms_failed_no_email_fallback');
});

test('lead-followup-worker skips duplicate sends when the quote request is already complete', async () => {
  const handler = createLeadFollowupWorkerHandler({
    configValid: true,
    smsAutomationEnabled: true,
    nowEpochSeconds: () => 5_000,
    getQuoteRequest: async () => makeRecord({ status: 'completed' }),
    acquireLease: async () => true,
    saveQuoteRequest: async () => undefined,
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

  const result = await handler({ quote_request_id: 'quote-request-1' });

  assert.equal(result.statusCode, 200);
  assert.match(result.body, /already_completed/);
});

test('lead-followup-worker marks phone-only quote requests for manual follow-up when SMS automation is off', async () => {
  let current = makeRecord({ email: '' });

  const handler = createLeadFollowupWorkerHandler({
    configValid: true,
    smsAutomationEnabled: false,
    nowEpochSeconds: () => 6_000,
    getQuoteRequest: async () => current,
    acquireLease: async () => true,
    saveQuoteRequest: async (record) => {
      current = { ...record };
    },
    generateDrafts: async () => ({
      aiError: '',
      aiModel: 'gpt-test',
      aiStatus: 'generated',
      drafts: {
        smsBody: 'Please text us 2-4 photos.',
        emailSubject: "Craig's Auto Upholstery - next steps",
        emailBody: 'Please email us 2-4 photos.',
        missingInfo: [],
      },
    }),
    sendSms: async () => ({ id: 'sms-should-not-send', status: 'sent' }),
    sendCustomerEmail: async () => ({ messageId: 'unused-email' }),
    sendOwnerEmail: async () => ({ messageId: 'owner-email-123' }),
  });

  const result = await handler({ quote_request_id: 'quote-request-1' });

  assert.equal(result.statusCode, 200);
  assert.equal(current.sms_status, 'skipped');
  assert.equal(current.sms_error, 'manual_followup_required');
  assert.equal(current.email_status, 'skipped');
  assert.equal(current.outreach_result, 'manual_followup_required');
});
