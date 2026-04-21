import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuoteRequestSubmitHandler } from './handler.ts';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import type { LeadPlatformRepos } from '../_lead-platform/repos/dynamo.ts';
import type { SubmitQuoteRequestDeps } from './submit-quote-request.ts';

function makeRepos(writes: LeadFollowupWorkItem[]): LeadPlatformRepos {
  const records = new Map<string, LeadFollowupWorkItem>();
  return {
    followupWork: {
      getByIdempotencyKey: async (idempotencyKey: string) => records.get(idempotencyKey) ?? null,
      listByStatus: async (status: LeadFollowupWorkItem['status']) =>
        Array.from(records.values()).filter((record) => record.status === status),
      acquireLease: async () => false,
      putIfAbsent: async (record: LeadFollowupWorkItem) => {
        if (records.has(record.idempotency_key)) return false;
        records.set(record.idempotency_key, { ...record });
        writes.push({ ...record });
        return true;
      },
      put: async (record: LeadFollowupWorkItem) => {
        records.set(record.idempotency_key, { ...record });
        writes.push({ ...record });
      },
    },
  } as unknown as LeadPlatformRepos;
}

function makeDeps(
  overrides: Partial<SubmitQuoteRequestDeps> = {},
): SubmitQuoteRequestDeps & { invoked: string[]; writes: LeadFollowupWorkItem[] } {
  const writes: LeadFollowupWorkItem[] = [];
  const invoked: string[] = [];
  return {
    configValid: true,
    nowEpochSeconds: () => 1_000,
    repos: makeRepos(writes),
    siteLabel: 'example.test',
    invokeFollowup: async (idempotencyKey) => {
      invoked.push(idempotencyKey);
    },
    ...overrides,
    invoked,
    writes,
  };
}

test('quote-request-submit queues lead follow-up when phone is provided', async () => {
  const deps = makeDeps();
  const handler = createQuoteRequestSubmitHandler(deps);

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    headers: { origin: 'https://example.test/contact' },
    body: JSON.stringify({
      name: 'Michael',
      phone: '(408) 555-0101',
      email: '',
      vehicle: '2018 Toyota Camry',
      service: 'seat-repair',
      message: 'Driver seat tear',
      client_event_id: 'form-submit-1',
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(deps.writes[0]?.phone, '(408) 555-0101');
  assert.equal(deps.invoked[0], 'form:form-submit-1');
});

test('quote-request-submit rejects non-POST HTTP methods', async () => {
  const handler = createQuoteRequestSubmitHandler(makeDeps());

  const result = await handler({
    requestContext: { http: { method: 'GET' } },
  });

  assert.equal(result.statusCode, 405);
});

test('quote-request-submit rejects invalid JSON bodies before validation', async () => {
  const handler = createQuoteRequestSubmitHandler(makeDeps());

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: '{"name":',
  });

  assert.equal(result.statusCode, 400);
  assert.match(result.body, /Invalid JSON body/);
});

test('quote-request-submit queues lead follow-up when email is provided without phone', async () => {
  const deps = makeDeps({ nowEpochSeconds: () => 2_000 });
  const handler = createQuoteRequestSubmitHandler(deps);

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({
      name: 'Customer',
      email: 'customer@example.com',
      phone: '',
      client_event_id: 'form-submit-2',
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(deps.writes[0]?.email, 'customer@example.com');
  assert.equal(deps.invoked[0], 'form:form-submit-2');
});

test('quote-request-submit rejects requests without a contact method', async () => {
  const handler = createQuoteRequestSubmitHandler(makeDeps({ nowEpochSeconds: () => 3_000 }));

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({
      name: 'Customer',
      email: '',
      phone: '',
      client_event_id: 'form-submit-3',
    }),
  });

  assert.equal(result.statusCode, 400);
  assert.match(result.body, /phone number or email/);
});

test('quote-request-submit returns benign success for honeypot follow-up works', async () => {
  const handler = createQuoteRequestSubmitHandler(makeDeps({ nowEpochSeconds: () => 4_000 }));

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({
      name: 'Spam',
      phone: '(408) 555-0101',
      company: 'bot-field',
      client_event_id: 'form-submit-4',
    }),
  });

  assert.equal(result.statusCode, 202);
});

test('quote-request-submit internal smoke mode persists the lead bundle without queuing follow-up', async () => {
  const deps = makeDeps({
    nowEpochSeconds: () => 5_000,
    persistQuoteRequest: async () => ({
      journeyId: 'journey-smoke',
      leadRecordId: 'lead-smoke',
      contactId: 'contact-smoke',
    }),
  });
  const handler = createQuoteRequestSubmitHandler(deps);

  const result = await handler({
    __smoke_test: true,
    name: 'Smoke Test',
    email: 'smoke@example.com',
    phone: '(408) 555-0199',
    journey_id: 'journey-smoke',
  } as unknown as Parameters<typeof handler>[0]);

  assert.equal(result.statusCode, 200);
  assert.equal(deps.writes.length, 0);
  assert.equal(deps.invoked.length, 0);
  assert.match(result.body, /"smoke_test":true/);
  assert.match(result.body, /"journey_id":"journey-smoke"/);
  assert.match(result.body, /"lead_record_id":"lead-smoke"/);
});

test('quote-request-submit queues lead follow-up with immutable lead linkage context', async () => {
  const deps = makeDeps({
    nowEpochSeconds: () => 6_000,
    persistQuoteRequest: async () => ({
      journeyId: 'journey-linked',
      leadRecordId: 'lead-linked',
      contactId: 'contact-linked',
    }),
  });
  const handler = createQuoteRequestSubmitHandler(deps);

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    headers: { origin: 'https://example.test/en/contact' },
    body: JSON.stringify({
      name: 'Michael',
      phone: '(408) 555-0101',
      locale: 'en',
      pageUrl: 'https://example.test/en/contact',
      user: 'anon-user',
      attribution: { utm_source: 'google' },
      client_event_id: 'form-submit-linked',
    }),
  });

  assert.equal(result.statusCode, 200);
  const latestWrite = deps.writes[deps.writes.length - 1];
  assert.equal(latestWrite?.journey_id, 'journey-linked');
  assert.equal(latestWrite?.lead_record_id, 'lead-linked');
  assert.equal(latestWrite?.contact_id, 'contact-linked');
  assert.equal(latestWrite?.page_url, 'https://example.test/en/contact');
  assert.equal(latestWrite?.user_id, 'anon-user');
});
