import assert from 'node:assert/strict';
import test from 'node:test';
import { createContactSubmitHandler } from './handler.ts';
import type { QuoteSubmissionRecord } from '../_lead-core/domain/quote-request.ts';

test('contact-submit queues quote follow-up when phone is provided', async () => {
  const queued: QuoteSubmissionRecord[] = [];
  const invoked: string[] = [];

  const handler = createContactSubmitHandler({
    configValid: true,
    createSubmissionId: () => 'submission-1',
    nowEpochSeconds: () => 1_000,
    siteLabel: 'cesar.autos',
    queueSubmission: async (record) => {
      queued.push(record);
    },
    invokeFollowup: async (submissionId) => {
      invoked.push(submissionId);
    },
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    headers: { origin: 'https://cesar.autos/contact' },
    body: JSON.stringify({
      name: 'Michael',
      phone: '(408) 555-0101',
      email: '',
      vehicle: '2018 Toyota Camry',
      service: 'seat-repair',
      message: 'Driver seat tear',
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(queued.length, 1);
  assert.equal(queued[0]?.phone, '(408) 555-0101');
  assert.equal(invoked[0], 'submission-1');
});

test('contact-submit rejects non-POST HTTP methods', async () => {
  const handler = createContactSubmitHandler({
    configValid: true,
    createSubmissionId: () => 'submission-method',
    nowEpochSeconds: () => 1_000,
    siteLabel: 'cesar.autos',
    queueSubmission: async () => undefined,
    invokeFollowup: async () => undefined,
  });

  const result = await handler({
    requestContext: { http: { method: 'GET' } },
  });

  assert.equal(result.statusCode, 405);
});

test('contact-submit rejects invalid JSON bodies before validation', async () => {
  const handler = createContactSubmitHandler({
    configValid: true,
    createSubmissionId: () => 'submission-json',
    nowEpochSeconds: () => 1_000,
    siteLabel: 'cesar.autos',
    queueSubmission: async () => undefined,
    invokeFollowup: async () => undefined,
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: '{"name":',
  });

  assert.equal(result.statusCode, 400);
  assert.match(result.body, /Invalid JSON body/);
});

test('contact-submit queues quote follow-up when email is provided without phone', async () => {
  const queued: QuoteSubmissionRecord[] = [];
  const invoked: string[] = [];

  const handler = createContactSubmitHandler({
    configValid: true,
    createSubmissionId: () => 'submission-2',
    nowEpochSeconds: () => 2_000,
    siteLabel: 'cesar.autos',
    queueSubmission: async (record) => {
      queued.push(record);
    },
    invokeFollowup: async (submissionId) => {
      invoked.push(submissionId);
    },
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({
      name: 'Customer',
      email: 'customer@example.com',
      phone: '',
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(queued.length, 1);
  assert.equal(queued[0]?.email, 'customer@example.com');
  assert.equal(invoked[0], 'submission-2');
});

test('contact-submit rejects requests without a contact method', async () => {
  const handler = createContactSubmitHandler({
    configValid: true,
    createSubmissionId: () => 'submission-3',
    nowEpochSeconds: () => 3_000,
    siteLabel: 'cesar.autos',
    queueSubmission: async () => undefined,
    invokeFollowup: async () => undefined,
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({
      name: 'Customer',
      email: '',
      phone: '',
    }),
  });

  assert.equal(result.statusCode, 400);
  assert.match(result.body, /phone number or email/);
});

test('contact-submit returns benign success for honeypot submissions', async () => {
  const handler = createContactSubmitHandler({
    configValid: true,
    createSubmissionId: () => 'submission-4',
    nowEpochSeconds: () => 4_000,
    siteLabel: 'cesar.autos',
    queueSubmission: async () => undefined,
    invokeFollowup: async () => undefined,
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({
      name: 'Spam',
      phone: '(408) 555-0101',
      company: 'bot-field',
    }),
  });

  assert.equal(result.statusCode, 202);
});

test('contact-submit internal smoke mode persists the lead bundle without queuing follow-up', async () => {
  const queued: QuoteSubmissionRecord[] = [];
  const invoked: string[] = [];

  const handler = createContactSubmitHandler({
    configValid: true,
    createSubmissionId: () => 'submission-smoke',
    nowEpochSeconds: () => 5_000,
    siteLabel: 'cesar.autos',
    persistQuoteRequest: async () => ({
      journeyId: 'journey-smoke',
      leadRecordId: 'lead-smoke',
      contactId: 'contact-smoke',
    }),
    queueSubmission: async (record) => {
      queued.push(record);
    },
    invokeFollowup: async (submissionId) => {
      invoked.push(submissionId);
    },
  });

  const result = await handler({
    __smoke_test: true,
    name: 'Smoke Test',
    email: 'smoke@example.com',
    phone: '(408) 555-0199',
    journey_id: 'journey-smoke',
  } as unknown as Parameters<typeof handler>[0]);

  assert.equal(result.statusCode, 200);
  assert.equal(queued.length, 0);
  assert.equal(invoked.length, 0);
  assert.match(result.body, /"smoke_test":true/);
  assert.match(result.body, /"journey_id":"journey-smoke"/);
  assert.match(result.body, /"lead_record_id":"lead-smoke"/);
});

test('contact-submit queues quote follow-up with immutable lead linkage context', async () => {
  const queued: QuoteSubmissionRecord[] = [];

  const handler = createContactSubmitHandler({
    configValid: true,
    createSubmissionId: () => 'submission-linked',
    nowEpochSeconds: () => 6_000,
    siteLabel: 'cesar.autos',
    persistQuoteRequest: async () => ({
      journeyId: 'journey-linked',
      leadRecordId: 'lead-linked',
      contactId: 'contact-linked',
    }),
    queueSubmission: async (record) => {
      queued.push(record);
    },
    invokeFollowup: async () => undefined,
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    headers: { origin: 'https://cesar.autos/en/contact' },
    body: JSON.stringify({
      name: 'Michael',
      phone: '(408) 555-0101',
      locale: 'en',
      pageUrl: 'https://cesar.autos/en/contact',
      user: 'anon-user',
      attribution: { utm_source: 'google' },
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(queued.length, 1);
  assert.equal(queued[0]?.journey_id, 'journey-linked');
  assert.equal(queued[0]?.lead_record_id, 'lead-linked');
  assert.equal(queued[0]?.contact_id, 'contact-linked');
  assert.equal(queued[0]?.page_url, 'https://cesar.autos/en/contact');
  assert.equal(queued[0]?.user_id, 'anon-user');
});
