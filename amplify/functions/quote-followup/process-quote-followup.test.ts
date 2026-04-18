import assert from 'node:assert/strict';
import test from 'node:test';
import type { QuoteSubmissionRecord } from '../_lead-core/domain/quote-request.ts';
import { processQuoteFollowup } from './process-quote-followup.ts';
import type { QuoteFollowupDeps } from './types.ts';

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
    origin: 'https://craigs.autos/request-a-quote',
    site_label: 'craigs.autos',
    journey_id: 'journey-1',
    lead_record_id: 'lead-record-1',
    contact_id: 'contact-1',
    locale: 'en',
    page_url: 'https://craigs.autos/request-a-quote',
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

function makeDeps(overrides: Partial<QuoteFollowupDeps> = {}): QuoteFollowupDeps {
  return {
    configValid: true,
    smsAutomationEnabled: true,
    createLeaseId: () => 'lease-1',
    nowEpochSeconds: () => 2_000,
    getSubmission: async () => makeRecord(),
    acquireLease: async () => true,
    saveSubmission: async () => undefined,
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
    sendSms: async () => ({ id: 'sms-1', status: 'sent' }),
    sendCustomerEmail: async () => ({ messageId: 'email-1' }),
    sendOwnerEmail: async () => ({ messageId: 'owner-1' }),
    ...overrides,
  };
}

test('processQuoteFollowup returns 404 when the submission is missing', async () => {
  const result = await processQuoteFollowup({
    deps: makeDeps({ getSubmission: async () => null }),
    submissionId: 'missing-submission',
  });

  assert.equal(result.statusCode, 404);
  assert.deepEqual(result.body, { error: 'Submission not found' });
});

test('processQuoteFollowup skips records that are already complete or actively leased', async () => {
  const completed = await processQuoteFollowup({
    deps: makeDeps({ getSubmission: async () => makeRecord({ status: 'completed' }) }),
    submissionId: 'submission-1',
  });
  const inProgress = await processQuoteFollowup({
    deps: makeDeps({
      getSubmission: async () => makeRecord({ status: 'processing', lock_expires_at: 2_500 }),
    }),
    submissionId: 'submission-1',
  });

  assert.deepEqual(completed.body, { ok: true, skipped: true, reason: 'already_completed' });
  assert.deepEqual(inProgress.body, { ok: true, skipped: true, reason: 'in_progress' });
});

test('processQuoteFollowup skips when the lease cannot be acquired', async () => {
  const result = await processQuoteFollowup({
    deps: makeDeps({ acquireLease: async () => false }),
    submissionId: 'submission-1',
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { ok: true, skipped: true, reason: 'lease_not_acquired' });
});

test('processQuoteFollowup syncs the mutated completed record after workflow success', async () => {
  let synced: QuoteSubmissionRecord | null = null;
  const result = await processQuoteFollowup({
    deps: makeDeps({
      syncLeadRecord: async (record) => {
        synced = { ...record };
      },
    }),
    submissionId: 'submission-1',
  });

  assert.equal(result.statusCode, 200);
  assert.ok(synced);
  const syncedRecord = synced as QuoteSubmissionRecord;
  assert.equal(syncedRecord.status, 'completed');
  assert.equal(syncedRecord.sms_status, 'sent');
  assert.equal(syncedRecord.owner_email_status, 'sent');
});
