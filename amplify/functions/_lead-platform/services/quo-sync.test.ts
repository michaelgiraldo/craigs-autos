import assert from 'node:assert/strict';
import test from 'node:test';
import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';
import type { LeadPlatformRepos } from '../repos/dynamo.ts';
import type { LeadContact } from '../domain/contact.ts';
import type { JourneyEvent } from '../domain/journey-event.ts';
import type { LeadRecord } from '../domain/lead-record.ts';
import { syncQuoLeadContact } from './quo-sync.ts';

function makeContact(overrides: Partial<LeadContact> = {}): LeadContact {
  return {
    contact_id: 'contact-1',
    normalized_phone: '+16173062716',
    normalized_email: null,
    first_name: 'Michael',
    last_name: 'Giraldo',
    display_name: 'Michael Giraldo',
    raw_phone: '(617) 306-2716',
    raw_email: null,
    quo_contact_id: null,
    quo_tags: ['Form Lead'],
    created_at_ms: 1_000,
    updated_at_ms: 1_000,
    ...overrides,
  };
}

function makeLeadRecord(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    lead_record_id: 'lead-record-1',
    journey_id: 'journey-1',
    contact_id: 'contact-1',
    status: 'outreach_sent',
    capture_channel: 'chat',
    title: 'Chat lead',
    vehicle: null,
    service: null,
    project_summary: 'Recover front seats',
    customer_message: 'Need a quote',
    customer_language: 'en',
    attribution: null,
    latest_outreach: {
      channel: 'sms',
      status: 'sent',
      provider: 'quo',
      external_id: 'MSG123',
      error: null,
      sent_at_ms: 2_000,
    },
    qualification: {
      qualified: false,
      qualified_at_ms: null,
    },
    first_action: 'chat_first_message_sent',
    latest_action: 'chat_first_message_sent',
    action_types: ['chat_first_message_sent'],
    action_count: 1,
    created_at_ms: 1_000,
    updated_at_ms: 2_000,
    ...overrides,
  };
}

test('syncQuoLeadContact upserts Quo contacts and persists remote tags', async () => {
  const originalFetch = globalThis.fetch;
  const savedContacts: LeadContact[] = [];
  const appendedEvents: JourneyEvent[] = [];
  const requests: string[] = [];

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push(String(url));
    if (String(url).includes('/contact-custom-fields')) {
      return new Response(
        JSON.stringify({
          data: [{ key: 'lead_tags', name: 'Lead Tags', type: 'multi-select' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (String(url).includes('/contacts?')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'CT_123',
              source: 'test-upholstery-web',
              externalId: 'test-upholstery:phone:+16173062716',
              customFields: [{ key: 'lead_tags', value: ['Form Lead'] }],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (String(url).includes('/contacts/CT_123')) {
      assert.equal(init?.method, 'PATCH');
      return new Response(
        JSON.stringify({
          data: {
            id: 'CT_123',
            source: 'test-upholstery-web',
            externalId: 'test-upholstery:phone:+16173062716',
            customFields: [{ key: 'lead_tags', value: ['Form Lead', 'Chat Lead'] }],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    throw new Error(`Unexpected fetch: ${String(url)}`);
  }) as typeof fetch;

  const leadRecordsRepo = {
    getById: async () => null,
    listByContactId: async () => [],
    listByStatus: async () => [],
    listPage: async () => ({ items: [] }),
    put: async () => undefined,
  };
  const journeyEventsRepo = {
    append: async (event: JourneyEvent) => {
      appendedEvents.push(event);
    },
    appendMany: async (events: JourneyEvent[]) => {
      appendedEvents.push(...events);
    },
    listByJourneyId: async () => [],
    listByLeadRecordId: async () => [],
    getBySortKey: async () => null,
    scanPage: async () => ({ items: [] }),
  };

  const repos: LeadPlatformRepos = {
    leadRecords: leadRecordsRepo,
    contacts: {
      getById: async () => makeContact(),
      findByNormalizedPhone: async () => null,
      findByNormalizedEmail: async () => null,
      findByQuoContactId: async () => null,
      put: async (contact) => {
        savedContacts.push(contact);
      },
    },
    journeys: {
      getById: async () => null,
      listPage: async () => ({ items: [] }),
      put: async () => undefined,
    },
    journeyEvents: journeyEventsRepo,
    followupWork: {
      acquireLease: async () => false,
      getById: async () => null,
      getByIdempotencyKey: async () => null,
      put: async () => undefined,
      putIfAbsent: async () => true,
    },
    conversionDecisions: {
      getById: async () => null,
      listByLeadRecordId: async () => [],
      put: async () => undefined,
    },
    conversionFeedbackOutbox: {
      getById: async () => null,
      acquireLease: async () => null,
      listByDecisionId: async () => [],
      listByLeadRecordId: async () => [],
      listByStatus: async () => [],
      put: async () => undefined,
    },
    conversionFeedbackOutcomes: {
      append: async () => undefined,
      listByLeadRecordId: async () => [],
      listByOutboxId: async () => [],
    },
    providerConversionDestinations: {
      getByKey: async () => null,
      listEnabled: async () => [],
      put: async () => undefined,
    },
  };

  try {
    const result = await syncQuoLeadContact({
      repos,
      contact: makeContact(),
      leadRecord: makeLeadRecord(),
      occurredAtMs: 2_001,
      config: {
        apiKey: 'quo_test_key',
        source: 'test-upholstery-web',
        externalIdPrefix: 'test-upholstery',
      },
    });

    assert.equal(result.synced, true);
    assert.equal(result.quoContactId, 'CT_123');
    assert.deepEqual(result.quoTags, ['Form Lead', 'Chat Lead']);
    assert.equal(savedContacts.length, 1);
    assert.equal(savedContacts[0]?.quo_contact_id, 'CT_123');
    assert.deepEqual(savedContacts[0]?.quo_tags, ['Form Lead', 'Chat Lead']);
    assert.equal(
      appendedEvents.some((event) => event.event_name === LEAD_EVENTS.quoContactSynced),
      true,
    );
    assert.equal(
      requests.some((url) => url.includes('/contact-custom-fields')),
      true,
    );
    assert.equal(
      requests.some((url) => url.includes('/contacts/CT_123')),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
