import assert from 'node:assert/strict';
import test from 'node:test';
import { createContactSubmitHandler } from '../contact-submit/handler.ts';
import type { QuoteSubmissionRecord } from '../_shared/quote-submissions.ts';
import { createQuoteFollowupHandler } from './handler.ts';

function makeStore() {
  return new Map<string, QuoteSubmissionRecord>();
}

test('async quote flow sends SMS first and notifies the owner end-to-end', async () => {
  const submissions = makeStore();
  const smsSends: Array<{ toE164: string; body: string }> = [];
  const customerEmails: string[] = [];
  const ownerEmails: string[] = [];

  const quoteFollowup = createQuoteFollowupHandler({
    configValid: true,
    nowEpochSeconds: () => 2_000,
    getSubmission: async (submissionId) => submissions.get(submissionId) ?? null,
    acquireLease: async () => true,
    saveSubmission: async (record) => {
      submissions.set(record.submission_id, { ...record });
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
    sendSms: async (args) => {
      smsSends.push(args);
      return { id: 'sms-123', status: 'sent' };
    },
    sendCustomerEmail: async ({ to }) => {
      customerEmails.push(to);
      return { messageId: 'email-123' };
    },
    sendOwnerEmail: async ({ record }) => {
      ownerEmails.push(record.submission_id);
      return { messageId: 'owner-123' };
    },
  });

  const contactSubmit = createContactSubmitHandler({
    configValid: true,
    createSubmissionId: () => 'submission-1',
    nowEpochSeconds: () => 1_000,
    siteLabel: 'cesar.autos',
    queueSubmission: async (record) => {
      submissions.set(record.submission_id, { ...record });
    },
    invokeFollowup: async (submissionId) => {
      const result = await quoteFollowup({ submission_id: submissionId });
      assert.equal(result.statusCode, 200);
    },
  });

  const result = await contactSubmit({
    requestContext: { http: { method: 'POST' } },
    headers: { origin: 'https://cesar.autos/en/contact' },
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

  const stored = submissions.get('submission-1');
  assert.equal(stored?.status, 'completed');
  assert.equal(stored?.sms_status, 'sent');
  assert.equal(stored?.email_status, 'skipped');
  assert.equal(stored?.owner_email_status, 'sent');
  assert.equal(stored?.outreach_result, 'sms_sent');
});

test('async quote flow falls back to email when only email is provided end-to-end', async () => {
  const submissions = makeStore();
  const smsSends: Array<{ toE164: string; body: string }> = [];
  const customerEmails: string[] = [];
  const ownerEmails: string[] = [];

  const quoteFollowup = createQuoteFollowupHandler({
    configValid: true,
    nowEpochSeconds: () => 2_000,
    getSubmission: async (submissionId) => submissions.get(submissionId) ?? null,
    acquireLease: async () => true,
    saveSubmission: async (record) => {
      submissions.set(record.submission_id, { ...record });
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
    sendSms: async (args) => {
      smsSends.push(args);
      return { id: 'sms-123', status: 'sent' };
    },
    sendCustomerEmail: async ({ to }) => {
      customerEmails.push(to);
      return { messageId: 'email-123' };
    },
    sendOwnerEmail: async ({ record }) => {
      ownerEmails.push(record.submission_id);
      return { messageId: 'owner-123' };
    },
  });

  const contactSubmit = createContactSubmitHandler({
    configValid: true,
    createSubmissionId: () => 'submission-2',
    nowEpochSeconds: () => 1_000,
    siteLabel: 'cesar.autos',
    queueSubmission: async (record) => {
      submissions.set(record.submission_id, { ...record });
    },
    invokeFollowup: async (submissionId) => {
      const result = await quoteFollowup({ submission_id: submissionId });
      assert.equal(result.statusCode, 200);
    },
  });

  const result = await contactSubmit({
    requestContext: { http: { method: 'POST' } },
    headers: { origin: 'https://cesar.autos/en/contact' },
    body: JSON.stringify({
      name: 'Customer',
      phone: '',
      email: 'customer@example.com',
      vehicle: '1969 Camaro',
      service: 'full-restoration',
      message: 'Looking for interior restoration.',
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(smsSends.length, 0);
  assert.deepEqual(customerEmails, ['customer@example.com']);
  assert.equal(ownerEmails.length, 1);

  const stored = submissions.get('submission-2');
  assert.equal(stored?.status, 'completed');
  assert.equal(stored?.sms_status, 'skipped');
  assert.equal(stored?.email_status, 'sent');
  assert.equal(stored?.outreach_result, 'email_sent_fallback');
});

test('contact submit marks the submission as error when worker invocation fails', async () => {
  const submissions = makeStore();

  const contactSubmit = createContactSubmitHandler({
    configValid: true,
    createSubmissionId: () => 'submission-3',
    nowEpochSeconds: () => 1_000,
    siteLabel: 'cesar.autos',
    queueSubmission: async (record) => {
      submissions.set(record.submission_id, { ...record });
    },
    invokeFollowup: async () => {
      throw new Error('worker unavailable');
    },
  });

  const result = await contactSubmit({
    requestContext: { http: { method: 'POST' } },
    headers: { origin: 'https://cesar.autos/en/contact' },
    body: JSON.stringify({
      name: 'Customer',
      phone: '(617) 306-2716',
    }),
  });

  assert.equal(result.statusCode, 502);
  assert.equal(submissions.get('submission-3')?.status, 'error');
});
