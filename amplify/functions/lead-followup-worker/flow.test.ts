import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuoteRequestSubmitHandler } from '../quote-request-submit/handler.ts';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import { createLeadFollowupWorkerHandler } from './handler.ts';

function makeStore() {
  return new Map<string, LeadFollowupWorkItem>();
}

test('async quote flow sends SMS first and notifies the owner end-to-end', async () => {
  const quoteRequests = makeStore();
  const smsSends: Array<{ toE164: string; body: string }> = [];
  const customerEmails: string[] = [];
  const ownerEmails: string[] = [];

  const leadFollowupWorker = createLeadFollowupWorkerHandler({
    configValid: true,
    smsAutomationEnabled: true,
    nowEpochSeconds: () => 2_000,
    getFollowupWork: async (followupWorkId) => quoteRequests.get(followupWorkId) ?? null,
    acquireLease: async () => true,
    saveFollowupWork: async (record) => {
      quoteRequests.set(record.followup_work_id, { ...record });
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
    sendSms: async (args) => {
      smsSends.push(args);
      return { id: 'sms-123', status: 'sent' };
    },
    sendCustomerEmail: async ({ to }) => {
      customerEmails.push(to);
      return { messageId: 'email-123' };
    },
    sendOwnerEmail: async ({ record }) => {
      ownerEmails.push(record.followup_work_id);
      return { messageId: 'owner-123' };
    },
  });

  const quoteRequestSubmit = createQuoteRequestSubmitHandler({
    configValid: true,
    createFollowupWorkId: () => 'followup-work-1',
    nowEpochSeconds: () => 1_000,
    siteLabel: 'example.test',
    enqueueFollowupWork: async (record) => {
      quoteRequests.set(record.followup_work_id, { ...record });
    },
    invokeFollowup: async (followupWorkId) => {
      const result = await leadFollowupWorker({ followup_work_id: followupWorkId });
      assert.equal(result.statusCode, 200);
    },
  });

  const result = await quoteRequestSubmit({
    requestContext: { http: { method: 'POST' } },
    headers: { origin: 'https://example.test/en/contact' },
    body: JSON.stringify({
      name: 'Michael',
      phone: '(617) 306-2716',
      email: 'michael@example.com',
      vehicle: '2018 Toyota Camry',
      service: 'seat-repair',
      message: 'Driver seat tear',
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(smsSends.length, 1);
  assert.equal(customerEmails.length, 0);
  assert.equal(ownerEmails.length, 1);

  const stored = quoteRequests.get('followup-work-1');
  assert.equal(stored?.status, 'completed');
  assert.equal(stored?.sms_status, 'sent');
  assert.equal(stored?.email_status, 'skipped');
  assert.equal(stored?.owner_email_status, 'sent');
  assert.equal(stored?.outreach_result, 'sms_sent');
});

test('async quote flow falls back to email when the stored follow-up work has no phone number', async () => {
  const quoteRequests = makeStore();
  const smsSends: Array<{ toE164: string; body: string }> = [];
  const customerEmails: string[] = [];
  const ownerEmails: string[] = [];

  const leadFollowupWorker = createLeadFollowupWorkerHandler({
    configValid: true,
    smsAutomationEnabled: true,
    nowEpochSeconds: () => 2_000,
    getFollowupWork: async (followupWorkId) => quoteRequests.get(followupWorkId) ?? null,
    acquireLease: async () => true,
    saveFollowupWork: async (record) => {
      quoteRequests.set(record.followup_work_id, { ...record });
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
    sendSms: async (args) => {
      smsSends.push(args);
      return { id: 'sms-123', status: 'sent' };
    },
    sendCustomerEmail: async ({ to }) => {
      customerEmails.push(to);
      return { messageId: 'email-123' };
    },
    sendOwnerEmail: async ({ record }) => {
      ownerEmails.push(record.followup_work_id);
      return { messageId: 'owner-123' };
    },
  });

  quoteRequests.set('followup-work-2', {
    followup_work_id: 'followup-work-2',
    idempotency_key: 'form:followup-work-2',
    source_event_id: 'followup-work-2',
    status: 'queued',
    created_at: 1_000,
    updated_at: 1_000,
    ttl: 99_999,
    name: 'Customer',
    email: 'customer@example.com',
    phone: '',
    vehicle: '1969 Camaro',
    service: 'full-restoration',
    message: 'Looking for interior restoration.',
    capture_channel: 'form',
    origin: 'https://example.test/en/request-a-quote',
    site_label: 'example.test',
    journey_id: null,
    lead_record_id: null,
    contact_id: null,
    locale: 'en',
    page_url: 'https://example.test/en/request-a-quote',
    user_id: 'anon-customer',
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
  });

  const result = await leadFollowupWorker({ followup_work_id: 'followup-work-2' });

  assert.equal(result.statusCode, 200);
  assert.equal(smsSends.length, 0);
  assert.deepEqual(customerEmails, ['customer@example.com']);
  assert.equal(ownerEmails.length, 1);

  const stored = quoteRequests.get('followup-work-2');
  assert.equal(stored?.status, 'completed');
  assert.equal(stored?.sms_status, 'skipped');
  assert.equal(stored?.email_status, 'sent');
  assert.equal(stored?.outreach_result, 'email_sent_fallback');
});

test('follow-up work submit marks the follow-up work as error when worker invocation fails', async () => {
  const quoteRequests = makeStore();

  const quoteRequestSubmit = createQuoteRequestSubmitHandler({
    configValid: true,
    createFollowupWorkId: () => 'followup-work-3',
    nowEpochSeconds: () => 1_000,
    siteLabel: 'example.test',
    enqueueFollowupWork: async (record) => {
      quoteRequests.set(record.followup_work_id, { ...record });
    },
    invokeFollowup: async () => {
      throw new Error('worker unavailable');
    },
  });

  const result = await quoteRequestSubmit({
    requestContext: { http: { method: 'POST' } },
    headers: { origin: 'https://example.test/en/contact' },
    body: JSON.stringify({
      name: 'Customer',
      phone: '(617) 306-2716',
    }),
  });

  assert.equal(result.statusCode, 502);
  assert.equal(quoteRequests.get('followup-work-3')?.status, 'error');
});

test('async quote flow marks phone-only follow-up works for manual follow-up when SMS automation is off', async () => {
  const quoteRequests = makeStore();
  const smsSends: Array<{ toE164: string; body: string }> = [];
  const customerEmails: string[] = [];
  const ownerEmails: string[] = [];

  const leadFollowupWorker = createLeadFollowupWorkerHandler({
    configValid: true,
    smsAutomationEnabled: false,
    nowEpochSeconds: () => 2_500,
    getFollowupWork: async (followupWorkId) => quoteRequests.get(followupWorkId) ?? null,
    acquireLease: async () => true,
    saveFollowupWork: async (record) => {
      quoteRequests.set(record.followup_work_id, { ...record });
    },
    generateDrafts: async () => ({
      aiError: '',
      aiModel: 'gpt-test',
      aiStatus: 'generated',
      drafts: {
        smsBody: 'Please text us 2-4 photos.',
        emailSubject: "Craig's Auto Upholstery - next steps",
        emailBody: 'Please email us 2-4 photos.',
        missingInfo: ['photos'],
      },
    }),
    sendSms: async (args) => {
      smsSends.push(args);
      return { id: 'sms-should-not-send', status: 'sent' };
    },
    sendCustomerEmail: async ({ to }) => {
      customerEmails.push(to);
      return { messageId: 'email-should-not-send' };
    },
    sendOwnerEmail: async ({ record }) => {
      ownerEmails.push(record.followup_work_id);
      return { messageId: 'owner-456' };
    },
  });

  const quoteRequestSubmit = createQuoteRequestSubmitHandler({
    configValid: true,
    createFollowupWorkId: () => 'followup-work-4',
    nowEpochSeconds: () => 1_500,
    siteLabel: 'craigs.autos',
    enqueueFollowupWork: async (record) => {
      quoteRequests.set(record.followup_work_id, { ...record });
    },
    invokeFollowup: async (followupWorkId) => {
      const result = await leadFollowupWorker({ followup_work_id: followupWorkId });
      assert.equal(result.statusCode, 200);
    },
  });

  const result = await quoteRequestSubmit({
    requestContext: { http: { method: 'POST' } },
    headers: { origin: 'https://craigs.autos/en/request-a-quote' },
    body: JSON.stringify({
      name: 'Customer',
      phone: '(408) 555-0101',
      email: '',
      vehicle: '1967 Mustang',
      service: 'classic-interior',
      message: 'Need a manual follow-up while text automation is offline.',
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(smsSends.length, 0);
  assert.equal(customerEmails.length, 0);
  assert.equal(ownerEmails.length, 1);

  const stored = quoteRequests.get('followup-work-4');
  assert.equal(stored?.status, 'completed');
  assert.equal(stored?.sms_status, 'skipped');
  assert.equal(stored?.sms_error, 'manual_followup_required');
  assert.equal(stored?.email_status, 'skipped');
  assert.equal(stored?.outreach_result, 'manual_followup_required');
});
