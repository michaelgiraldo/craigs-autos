import assert from 'node:assert/strict';
import test from 'node:test';
import type { QuoteRequestRecord } from '../_lead-platform/domain/quote-request.ts';
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

function makeDeps(overrides: Partial<EmailIntakeDeps> = {}): EmailIntakeDeps {
  const statuses = new Map<string, { reason: string; status: EmailIntakeLedgerStatus }>();
  return {
    config: {
      allowDirectIntake: false,
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
    createQuoteRequestId: () => 'email_quote_1',
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
    queueQuoteRequest: async () => undefined,
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
  const queuedRecords: QuoteRequestRecord[] = [];
  let invokedQuoteRequestId = '';
  let deleted = false;

  const deps = makeDeps({
    deleteRawEmail: async () => {
      deleted = true;
    },
    invokeFollowup: async (quoteRequestId) => {
      invokedQuoteRequestId = quoteRequestId;
    },
    persistEmailLead: async (input) => {
      persistedInputs.push(input);
      return {
        contactId: 'contact-1',
        journeyId: 'journey-1',
        leadRecordId: 'lead-1',
      };
    },
    queueQuoteRequest: async (record) => {
      queuedRecords.push(record);
    },
  });

  const result = await processEmailIntakeEvent(s3Event(), deps);

  assert.equal(result.ok, true);
  assert.equal(deleted, false);
  assert.equal(invokedQuoteRequestId, 'email_quote_1');
  assert.equal(persistedInputs[0]?.customerEmail, 'customer@example.com');
  assert.equal(queuedRecords[0]?.capture_channel, 'email');
  assert.equal(queuedRecords[0]?.preferred_outreach_channel, 'email');
  assert.equal(queuedRecords[0]?.email_status, null);
  assert.equal(queuedRecords[0]?.email_subject, '');
  assert.equal(queuedRecords[0]?.email_body, '');
  assert.equal(queuedRecords[0]?.sms_body, '');
  assert.equal(queuedRecords[0]?.source_message_id, '<message-1@example.com>');
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
