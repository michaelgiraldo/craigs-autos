import assert from 'node:assert/strict';
import test from 'node:test';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import type { QuoteRequestLeadIntake } from '../_lead-platform/services/followup-work.ts';
import type { QuoteRequestSubmitRequest } from './request.ts';
import { submitQuoteRequest } from './submit-quote-request.ts';

function makeRequest(
  overrides: Partial<QuoteRequestSubmitRequest> = {},
): QuoteRequestSubmitRequest {
  return {
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
    userId: 'anon-user',
    vehicle: '1969 Camaro',
    ...overrides,
  };
}

test('submitQuoteRequest persists lead context before queueing the follow-up work', async () => {
  const queued: LeadFollowupWorkItem[] = [];
  const persistedInputs: QuoteRequestLeadIntake[] = [];
  const invoked: string[] = [];

  const result = await submitQuoteRequest(makeRequest(), {
    configValid: true,
    createFollowupWorkId: () => 'quote-request-1',
    nowEpochSeconds: () => 1_000,
    siteLabel: 'craigs.autos',
    persistQuoteRequest: async (input) => {
      persistedInputs.push(input);
      return {
        contactId: 'contact-1',
        journeyId: 'journey-1',
        leadRecordId: 'lead-1',
      };
    },
    enqueueFollowupWork: async (record) => {
      queued.push(record);
    },
    invokeFollowup: async (followupWorkId) => {
      invoked.push(followupWorkId);
    },
  });

  assert.equal(result.kind, 'submitted');
  assert.equal(result.journeyId, 'journey-1');
  assert.equal(result.leadRecordId, 'lead-1');
  assert.equal(persistedInputs[0]?.occurredAtMs, 1_000_000);
  assert.equal(persistedInputs[0]?.followupWorkId, 'form_client-event-1');
  assert.equal(queued[0]?.followup_work_id, 'form_client-event-1');
  assert.equal(queued[0]?.idempotency_key, 'form:client-event-1');
  assert.equal(queued[0]?.lead_record_id, 'lead-1');
  assert.equal(queued[0]?.contact_id, 'contact-1');
  assert.deepEqual(invoked, ['form_client-event-1']);
});

test('submitQuoteRequest smoke mode verifies lead persistence without queueing follow-up', async () => {
  const queued: LeadFollowupWorkItem[] = [];
  const invoked: string[] = [];

  const result = await submitQuoteRequest(makeRequest({ isSmokeTest: true }), {
    configValid: true,
    createFollowupWorkId: () => 'quote-request-smoke',
    nowEpochSeconds: () => 2_000,
    siteLabel: 'craigs.autos',
    persistQuoteRequest: async () => ({
      contactId: 'contact-smoke',
      journeyId: 'journey-smoke',
      leadRecordId: 'lead-smoke',
    }),
    enqueueFollowupWork: async (record) => {
      queued.push(record);
    },
    invokeFollowup: async (followupWorkId) => {
      invoked.push(followupWorkId);
    },
  });

  assert.equal(result.kind, 'smoke_test');
  assert.equal(result.journeyId, 'journey-smoke');
  assert.equal(result.leadRecordId, 'lead-smoke');
  assert.equal(queued.length, 0);
  assert.equal(invoked.length, 0);
});

test('submitQuoteRequest marks queued follow-up work as error when follow-up dispatch fails', async () => {
  const queued: LeadFollowupWorkItem[] = [];

  const result = await submitQuoteRequest(makeRequest(), {
    configValid: true,
    createFollowupWorkId: () => 'quote-request-error',
    nowEpochSeconds: () => 3_000,
    siteLabel: 'craigs.autos',
    enqueueFollowupWork: async (record) => {
      queued.push(record);
    },
    invokeFollowup: async () => {
      throw new Error('worker unavailable');
    },
  });

  assert.equal(result.kind, 'followup_invoke_failed');
  assert.equal(queued.length, 2);
  assert.equal(queued[0]?.status, 'queued');
  assert.equal(queued[1]?.status, 'error');
  assert.equal(queued[1]?.followup_work_id, 'form_client-event-1');
});
