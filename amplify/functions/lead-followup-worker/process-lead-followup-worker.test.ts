import assert from 'node:assert/strict';
import test from 'node:test';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import { processLeadFollowupWorker } from './process-lead-followup-worker.ts';
import type { LeadFollowupWorkerDeps } from './types.ts';

function makeRecord(overrides: Partial<LeadFollowupWorkItem> = {}): LeadFollowupWorkItem {
  return {
    followup_work_id: 'followup-work-1',
    idempotency_key: 'form:followup-work-1',
    source_event_id: 'followup-work-1',
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
    capture_channel: 'form',
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

function makeDeps(overrides: Partial<LeadFollowupWorkerDeps> = {}): LeadFollowupWorkerDeps {
  return {
    configValid: true,
    smsAutomationEnabled: true,
    createLeaseId: () => 'lease-1',
    nowEpochSeconds: () => 2_000,
    getFollowupWork: async () => makeRecord(),
    acquireLease: async () => true,
    saveFollowupWork: async () => undefined,
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

test('processLeadFollowupWorker returns 404 when the follow-up work is missing', async () => {
  const result = await processLeadFollowupWorker({
    deps: makeDeps({ getFollowupWork: async () => null }),
    idempotencyKey: 'form:missing-follow-up-work',
  });

  assert.equal(result.statusCode, 404);
  assert.deepEqual(result.body, { error: 'Follow-up work not found' });
});

test('processLeadFollowupWorker skips records that are already complete or actively leased', async () => {
  const completed = await processLeadFollowupWorker({
    deps: makeDeps({ getFollowupWork: async () => makeRecord({ status: 'completed' }) }),
    idempotencyKey: 'form:followup-work-1',
  });
  const inProgress = await processLeadFollowupWorker({
    deps: makeDeps({
      getFollowupWork: async () => makeRecord({ status: 'processing', lock_expires_at: 2_500 }),
    }),
    idempotencyKey: 'form:followup-work-1',
  });

  assert.deepEqual(completed.body, { ok: true, skipped: true, reason: 'already_completed' });
  assert.deepEqual(inProgress.body, { ok: true, skipped: true, reason: 'in_progress' });
});

test('processLeadFollowupWorker skips when the lease cannot be acquired', async () => {
  const result = await processLeadFollowupWorker({
    deps: makeDeps({ acquireLease: async () => false }),
    idempotencyKey: 'form:followup-work-1',
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { ok: true, skipped: true, reason: 'lease_not_acquired' });
});

test('processLeadFollowupWorker syncs the mutated completed record after workflow success', async () => {
  let synced: LeadFollowupWorkItem | null = null;
  const result = await processLeadFollowupWorker({
    deps: makeDeps({
      syncLeadRecord: async (record) => {
        synced = { ...record };
      },
    }),
    idempotencyKey: 'form:followup-work-1',
  });

  assert.equal(result.statusCode, 200);
  assert.ok(synced);
  const syncedRecord = synced as LeadFollowupWorkItem;
  assert.equal(syncedRecord.status, 'completed');
  assert.equal(syncedRecord.sms_status, 'sent');
  assert.equal(syncedRecord.owner_email_status, 'sent');
});

test('processLeadFollowupWorker cleans transient lead attachments after completion', async () => {
  let cleanupRecord: LeadFollowupWorkItem | null = null;
  const result = await processLeadFollowupWorker({
    deps: makeDeps({
      getFollowupWork: async () =>
        makeRecord({
          attachments: [
            {
              attachment_id: 'photo-1',
              source: 'form',
              filename: 'seat.jpg',
              content_type: 'image/jpeg',
              byte_size: 128,
              disposition: 'customer_photo',
              status: 'supported',
              storage: {
                kind: 's3',
                bucket: 'lead-attachments',
                key: 'form/client-event/photo-1/seat.jpg',
              },
            },
          ],
          attachment_count: 1,
          photo_attachment_count: 1,
        }),
      cleanupLeadAttachments: async (record) => {
        cleanupRecord = { ...record };
      },
    }),
    idempotencyKey: 'form:followup-work-1',
  });

  assert.equal(result.statusCode, 200);
  assert.ok(cleanupRecord);
  assert.equal((cleanupRecord as LeadFollowupWorkItem).status, 'completed');
  assert.equal((cleanupRecord as LeadFollowupWorkItem).attachments?.[0]?.storage.kind, 's3');
});
