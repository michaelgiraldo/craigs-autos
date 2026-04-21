import assert from 'node:assert/strict';
import test from 'node:test';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import type { LeadPlatformRepos } from '../_lead-platform/repos/dynamo.ts';
import { processEmailIntakeEvent } from './process-email-intake.ts';
import type {
  EmailIntakeDeps,
  EmailIntakeLedgerStatus,
  PersistEmailLeadInput,
  S3EmailSource,
} from './types.ts';

function rawEmail(headers: Record<string, string>, body: string): Buffer {
  return Buffer.from(
    [
      ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body,
    ].join('\r\n'),
    'utf8',
  );
}

function makeRepos(writes: LeadFollowupWorkItem[]): LeadPlatformRepos {
  const records = new Map<string, LeadFollowupWorkItem>();
  return {
    followupWork: {
      getByIdempotencyKey: async (idempotencyKey: string) => records.get(idempotencyKey) ?? null,
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

function makeDeps(overrides: Partial<EmailIntakeDeps> = {}): EmailIntakeDeps {
  const statuses = new Map<string, { reason: string; status: EmailIntakeLedgerStatus }>();
  const writes: LeadFollowupWorkItem[] = [];
  return {
    config: {
      googleRouteHeaderValue: 'contact-public-intake',
      intakeRecipient: 'contact-intake@email-intake.craigs.autos',
      model: 'gpt-test',
      originalRecipient: 'contact@craigs.autos',
      shopAddress: '271 Bestor St, San Jose, CA 95112',
      shopName: "Craig's Auto Upholstery",
      shopPhoneDisplay: '(408) 379-3820',
      siteLabel: 'craigs.autos',
    },
    configValid: true,
    deleteRawEmail: async () => undefined,
    evaluateLead: async ({ email }) => ({
      aiError: '',
      customerEmail: email.from?.address ?? null,
      customerLanguage: 'en',
      customerName: email.from?.name ?? null,
      customerPhone: null,
      isLead: true,
      leadReason: 'seat_repair_request',
      missingInfo: ['photos'],
      projectSummary: 'Customer needs a seat repair.',
      service: 'seat repair',
      vehicle: 'Toyota Camry',
    }),
    getRawEmail: async () =>
      rawEmail(
        {
          From: 'Customer Example <customer@example.com>',
          To: 'contact-intake@email-intake.craigs.autos',
          Subject: 'Seat repair',
          'Message-ID': '<message-1@example.com>',
          'X-Craigs-Google-Route': 'contact-public-intake',
          'X-Gm-Original-To': 'contact@craigs.autos',
        },
        'Can you fix the driver seat in my Toyota Camry?',
      ),
    invokeFollowup: async () => undefined,
    ledger: {
      reserve: async ({ key }) => {
        if (statuses.has(key) && statuses.get(key)?.status !== 'error') return false;
        statuses.set(key, { reason: '', status: 'processing' });
        return true;
      },
      markStatus: async ({ key, reason = '', status }) => {
        statuses.set(key, { reason, status });
      },
    },
    nowEpochSeconds: () => 2_000,
    persistEmailLead: async () => ({
      contactId: 'contact-1',
      journeyId: 'journey-1',
      leadRecordId: 'lead-1',
    }),
    repos: makeRepos(writes),
    ...overrides,
  };
}

function s3Event(source: S3EmailSource = { bucket: 'email-bucket', key: 'raw/message-1' }) {
  return {
    Records: [
      {
        s3: {
          bucket: { name: source.bucket },
          object: { key: encodeURIComponent(source.key) },
        },
      },
    ],
  };
}

test('email intake queues an accepted Google-routed lead for email-first follow-up', async () => {
  const persistedInputs: PersistEmailLeadInput[] = [];
  const queuedRecords: LeadFollowupWorkItem[] = [];
  let invokedIdempotencyKey = '';
  let deleted = false;

  const deps = makeDeps({
    deleteRawEmail: async () => {
      deleted = true;
    },
    invokeFollowup: async (idempotencyKey) => {
      invokedIdempotencyKey = idempotencyKey;
    },
    persistEmailLead: async (input) => {
      persistedInputs.push(input);
      return {
        contactId: 'contact-1',
        journeyId: 'journey-1',
        leadRecordId: 'lead-1',
      };
    },
    repos: makeRepos(queuedRecords),
  });

  const result = await processEmailIntakeEvent(s3Event(), deps);

  assert.equal(result.ok, true);
  assert.equal(deleted, false);
  assert.equal(invokedIdempotencyKey.startsWith('email:'), true);
  assert.equal(persistedInputs[0]?.customerEmail, 'customer@example.com');
  assert.equal(queuedRecords[0]?.capture_channel, 'email');
  assert.equal(queuedRecords[0]?.preferred_outreach_channel, 'email');
  assert.equal(queuedRecords[1]?.lead_record_id, 'lead-1');
  assert.equal(queuedRecords[1]?.email_status, null);
  assert.equal(queuedRecords[1]?.email_subject, '');
  assert.equal(queuedRecords[1]?.email_body, '');
  assert.equal(queuedRecords[1]?.sms_body, '');
  assert.equal(queuedRecords[1]?.source_message_id, '<message-1@example.com>');
});

test('email intake rejects existing email threads before OpenAI and deletes raw mail', async () => {
  let evaluated = false;
  let deleted = false;

  const deps = makeDeps({
    deleteRawEmail: async () => {
      deleted = true;
    },
    evaluateLead: async () => {
      evaluated = true;
      throw new Error('should not evaluate replies');
    },
    getRawEmail: async () =>
      rawEmail(
        {
          From: 'Customer Example <customer@example.com>',
          To: 'contact-intake@email-intake.craigs.autos',
          Subject: 'Re: Seat repair',
          'Message-ID': '<message-2@example.com>',
          'In-Reply-To': '<message-1@example.com>',
          'X-Craigs-Google-Route': 'contact-public-intake',
          'X-Gm-Original-To': 'contact@craigs.autos',
        },
        'Following up',
      ),
  });

  const result = await processEmailIntakeEvent(s3Event(), deps);

  assert.equal(result.ok, true);
  assert.equal(evaluated, false);
  assert.equal(deleted, true);
  assert.deepEqual(result.results[0], {
    key: 'raw/message-1',
    rejected: true,
    reason: 'existing_email_thread',
  });
});

test('email intake rejects missing Google route header before OpenAI', async () => {
  let evaluated = false;
  let deleted = false;

  const deps = makeDeps({
    deleteRawEmail: async () => {
      deleted = true;
    },
    evaluateLead: async () => {
      evaluated = true;
      throw new Error('should not evaluate invalid routes');
    },
    getRawEmail: async () =>
      rawEmail(
        {
          From: 'Customer Example <customer@example.com>',
          To: 'contact-intake@email-intake.craigs.autos',
          Subject: 'Seat repair',
          'Message-ID': '<message-3@example.com>',
          'X-Gm-Original-To': 'contact@craigs.autos',
        },
        'Can you fix this seat?',
      ),
  });

  const result = await processEmailIntakeEvent(
    s3Event({ bucket: 'email-bucket', key: 'raw/3' }),
    deps,
  );

  assert.equal(result.ok, true);
  assert.equal(evaluated, false);
  assert.equal(deleted, true);
  assert.deepEqual(result.results[0], {
    key: 'raw/3',
    rejected: true,
    reason: 'missing_expected_google_route',
  });
});

test('email intake rejects missing original recipient header before OpenAI', async () => {
  let evaluated = false;
  let deleted = false;

  const deps = makeDeps({
    deleteRawEmail: async () => {
      deleted = true;
    },
    evaluateLead: async () => {
      evaluated = true;
      throw new Error('should not evaluate invalid routes');
    },
    getRawEmail: async () =>
      rawEmail(
        {
          From: 'Customer Example <customer@example.com>',
          To: 'contact-intake@email-intake.craigs.autos',
          Subject: 'Seat repair',
          'Message-ID': '<message-4@example.com>',
          'X-Craigs-Google-Route': 'contact-public-intake',
        },
        'Can you fix this seat?',
      ),
  });

  const result = await processEmailIntakeEvent(
    s3Event({ bucket: 'email-bucket', key: 'raw/4' }),
    deps,
  );

  assert.equal(result.ok, true);
  assert.equal(evaluated, false);
  assert.equal(deleted, true);
  assert.deepEqual(result.results[0], {
    key: 'raw/4',
    rejected: true,
    reason: 'missing_expected_google_route',
  });
});
