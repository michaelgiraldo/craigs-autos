import assert from 'node:assert/strict';
import test from 'node:test';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import { createStableLeadFollowupWorkId } from '../_lead-platform/domain/ids.ts';
import type { LeadPlatformRepos } from '../_lead-platform/repos/dynamo.ts';
import type { QuoteRequestLeadIntake } from '../_lead-platform/services/followup-work.ts';
import type { QuoteRequestSubmitRequest } from './request.ts';
import { submitQuoteRequest } from './submit-quote-request.ts';

function makeRequest(
  overrides: Partial<QuoteRequestSubmitRequest> = {},
): QuoteRequestSubmitRequest {
  return {
    attachments: [],
    attribution: null,
    clientEventId: 'client-event-1',
    company: '',
    effectivePageUrl: 'https://craigs.autos/en/request-a-quote',
    email: 'customer@example.com',
    isSmokeTest: false,
    journeyId: 'journey-client',
    locale: 'en',
    message: 'Driver seat tear',
    name: 'Customer',
    origin: 'https://craigs.autos',
    pageUrl: 'https://craigs.autos/en/request-a-quote',
    phone: '(408) 555-0101',
    service: 'seat-repair',
    unsupportedAttachmentCount: 0,
    userId: 'anon-user',
    vehicle: '1969 Camaro',
    ...overrides,
  };
}

function makeRepos(writes: LeadFollowupWorkItem[], steps: string[] = []): LeadPlatformRepos {
  const records = new Map<string, LeadFollowupWorkItem>();
  return {
    followupWork: {
      getByIdempotencyKey: async (idempotencyKey: string) => records.get(idempotencyKey) ?? null,
      listByStatus: async (status: LeadFollowupWorkItem['status']) =>
        [...records.values()].filter((record) => record.status === status),
      acquireLease: async () => false,
      putIfAbsent: async (record: LeadFollowupWorkItem) => {
        steps.push('reserve');
        if (records.has(record.idempotency_key)) return false;
        records.set(record.idempotency_key, { ...record });
        writes.push({ ...record });
        return true;
      },
      put: async (record: LeadFollowupWorkItem) => {
        steps.push('put');
        records.set(record.idempotency_key, { ...record });
        writes.push({ ...record });
      },
    },
  } as unknown as LeadPlatformRepos;
}

test('submitQuoteRequest reserves follow-up work before persisting the lead', async () => {
  const writes: LeadFollowupWorkItem[] = [];
  const persistedInputs: QuoteRequestLeadIntake[] = [];
  const invoked: string[] = [];
  const steps: string[] = [];
  const expectedFollowupWorkId = createStableLeadFollowupWorkId({
    idempotencyKey: 'form:client-event-1',
    prefix: 'form',
  });

  const result = await submitQuoteRequest(makeRequest(), {
    configValid: true,
    nowEpochSeconds: () => 1_000,
    repos: makeRepos(writes, steps),
    siteLabel: 'craigs.autos',
    persistQuoteRequest: async (input) => {
      steps.push('persist');
      persistedInputs.push(input);
      return {
        contactId: 'contact-1',
        journeyId: 'journey-1',
        leadRecordId: 'lead-1',
      };
    },
    invokeFollowup: async (idempotencyKey) => {
      steps.push('invoke');
      invoked.push(idempotencyKey);
    },
  });

  assert.equal(result.kind, 'submitted');
  assert.equal(result.journeyId, 'journey-1');
  assert.equal(result.leadRecordId, 'lead-1');
  assert.equal(persistedInputs[0]?.occurredAtMs, 1_000_000);
  assert.equal(persistedInputs[0]?.followupWorkId, expectedFollowupWorkId);
  assert.deepEqual(steps, ['reserve', 'persist', 'put', 'invoke']);
  assert.equal(writes[0]?.followup_work_id, expectedFollowupWorkId);
  assert.equal(writes[0]?.idempotency_key, 'form:client-event-1');
  assert.equal(writes[0]?.lead_record_id, null);
  assert.equal(writes[1]?.lead_record_id, 'lead-1');
  assert.equal(writes[1]?.contact_id, 'contact-1');
  assert.deepEqual(invoked, ['form:client-event-1']);
});

test('submitQuoteRequest smoke mode verifies lead persistence without queueing follow-up', async () => {
  const writes: LeadFollowupWorkItem[] = [];
  const invoked: string[] = [];

  const result = await submitQuoteRequest(makeRequest({ isSmokeTest: true }), {
    configValid: true,
    nowEpochSeconds: () => 2_000,
    repos: makeRepos(writes),
    siteLabel: 'craigs.autos',
    persistQuoteRequest: async () => ({
      contactId: 'contact-smoke',
      journeyId: 'journey-smoke',
      leadRecordId: 'lead-smoke',
    }),
    invokeFollowup: async (idempotencyKey) => {
      invoked.push(idempotencyKey);
    },
  });

  assert.equal(result.kind, 'smoke_test');
  assert.equal(result.journeyId, 'journey-smoke');
  assert.equal(result.leadRecordId, 'lead-smoke');
  assert.equal(writes.length, 0);
  assert.equal(invoked.length, 0);
});

test('submitQuoteRequest marks queued follow-up work as error when follow-up dispatch fails', async () => {
  const writes: LeadFollowupWorkItem[] = [];
  const expectedFollowupWorkId = createStableLeadFollowupWorkId({
    idempotencyKey: 'form:client-event-1',
    prefix: 'form',
  });

  const result = await submitQuoteRequest(makeRequest(), {
    configValid: true,
    nowEpochSeconds: () => 3_000,
    repos: makeRepos(writes),
    siteLabel: 'craigs.autos',
    invokeFollowup: async () => {
      throw new Error('worker unavailable');
    },
  });

  assert.equal(result.kind, 'followup_invoke_failed');
  assert.equal(writes.length, 3);
  assert.equal(writes[0]?.status, 'queued');
  assert.equal(writes[2]?.status, 'error');
  assert.equal(writes[2]?.followup_work_id, expectedFollowupWorkId);
});

test('submitQuoteRequest stores resolved form attachment manifests', async () => {
  const writes: LeadFollowupWorkItem[] = [];
  const persistedInputs: QuoteRequestLeadIntake[] = [];

  const result = await submitQuoteRequest(
    makeRequest({
      attachments: [
        {
          attachmentId: 'attachment-1',
          byteSize: 1024,
          contentType: 'image/jpeg',
          filename: 'seat.jpg',
          key: 'form/client-event-1/attachment-1/seat.jpg',
        },
      ],
      unsupportedAttachmentCount: 1,
    }),
    {
      configValid: true,
      nowEpochSeconds: () => 4_000,
      repos: makeRepos(writes),
      siteLabel: 'craigs.autos',
      persistQuoteRequest: async (input) => {
        persistedInputs.push(input);
        return {
          contactId: 'contact-1',
          journeyId: 'journey-1',
          leadRecordId: 'lead-1',
        };
      },
      resolveFormAttachments: async ({ unsupportedAttachmentCount }) => ({
        attachments: [
          {
            attachment_id: 'attachment-1',
            byte_size: 1024,
            content_type: 'image/jpeg',
            disposition: 'customer_photo',
            filename: 'seat.jpg',
            source: 'form',
            status: 'supported',
            storage: {
              kind: 's3',
              bucket: 'photo-bucket',
              key: 'form/client-event-1/attachment-1/seat.jpg',
            },
          },
        ],
        unsupportedAttachmentCount,
      }),
      invokeFollowup: async () => undefined,
    },
  );

  assert.equal(result.kind, 'submitted');
  assert.equal(writes[0]?.photo_attachment_count, 1);
  assert.equal(writes[0]?.unsupported_attachment_count, 1);
  assert.equal(writes[0]?.attachments?.[0]?.storage.kind, 's3');
  assert.equal(persistedInputs[0]?.photoAttachmentCount, 1);
  assert.equal(persistedInputs[0]?.unsupportedAttachmentCount, 1);
});
