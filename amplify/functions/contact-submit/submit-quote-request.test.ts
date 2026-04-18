import assert from 'node:assert/strict';
import test from 'node:test';
import type { QuoteSubmissionRecord } from '../_lead-core/domain/quote-request.ts';
import type { QuoteRequestLeadIntake } from '../_lead-core/services/quote-request.ts';
import type { ContactSubmitRequest } from './request.ts';
import { submitQuoteRequest } from './submit-quote-request.ts';

function makeRequest(overrides: Partial<ContactSubmitRequest> = {}): ContactSubmitRequest {
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

test('submitQuoteRequest persists lead context before queueing the submission', async () => {
  const queued: QuoteSubmissionRecord[] = [];
  const persistedInputs: QuoteRequestLeadIntake[] = [];
  const invoked: string[] = [];

  const result = await submitQuoteRequest(makeRequest(), {
    configValid: true,
    createSubmissionId: () => 'submission-1',
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
    queueSubmission: async (record) => {
      queued.push(record);
    },
    invokeFollowup: async (submissionId) => {
      invoked.push(submissionId);
    },
  });

  assert.equal(result.kind, 'submitted');
  assert.equal(result.journeyId, 'journey-1');
  assert.equal(result.leadRecordId, 'lead-1');
  assert.equal(persistedInputs[0]?.occurredAtMs, 1_000_000);
  assert.equal(queued[0]?.lead_record_id, 'lead-1');
  assert.equal(queued[0]?.contact_id, 'contact-1');
  assert.deepEqual(invoked, ['submission-1']);
});

test('submitQuoteRequest smoke mode verifies lead persistence without queueing follow-up', async () => {
  const queued: QuoteSubmissionRecord[] = [];
  const invoked: string[] = [];

  const result = await submitQuoteRequest(makeRequest({ isSmokeTest: true }), {
    configValid: true,
    createSubmissionId: () => 'submission-smoke',
    nowEpochSeconds: () => 2_000,
    siteLabel: 'craigs.autos',
    persistQuoteRequest: async () => ({
      contactId: 'contact-smoke',
      journeyId: 'journey-smoke',
      leadRecordId: 'lead-smoke',
    }),
    queueSubmission: async (record) => {
      queued.push(record);
    },
    invokeFollowup: async (submissionId) => {
      invoked.push(submissionId);
    },
  });

  assert.equal(result.kind, 'smoke_test');
  assert.equal(result.journeyId, 'journey-smoke');
  assert.equal(result.leadRecordId, 'lead-smoke');
  assert.equal(queued.length, 0);
  assert.equal(invoked.length, 0);
});

test('submitQuoteRequest marks queued submission as error when follow-up dispatch fails', async () => {
  const queued: QuoteSubmissionRecord[] = [];

  const result = await submitQuoteRequest(makeRequest(), {
    configValid: true,
    createSubmissionId: () => 'submission-error',
    nowEpochSeconds: () => 3_000,
    siteLabel: 'craigs.autos',
    queueSubmission: async (record) => {
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
  assert.equal(queued[1]?.submission_id, 'submission-error');
});
