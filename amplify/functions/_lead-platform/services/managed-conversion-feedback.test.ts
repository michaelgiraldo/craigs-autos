import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  LeadConversionDecision,
  LeadConversionFeedbackOutboxItem,
  LeadConversionFeedbackOutcome,
  ProviderConversionDestination,
} from '../domain/conversion-feedback.ts';
import type { LeadContact } from '../domain/contact.ts';
import type { Journey } from '../domain/journey.ts';
import type { JourneyEvent } from '../domain/journey-event.ts';
import type { LeadRecord } from '../domain/lead-record.ts';
import type { LeadPlatformRepos } from '../repos/dynamo.ts';
import {
  createManagedConversionDecisionForLead,
  suppressManagedConversionFeedbackForLead,
} from './managed-conversion-feedback.ts';
import { resolveProviderConversionDestinations } from './managed-conversion-destinations.ts';

function mapValues<T>(map: Map<string, T>): T[] {
  const values: T[] = [];
  map.forEach((value) => {
    values.push(value);
  });
  return values;
}

function makeContact(): LeadContact {
  return {
    contact_id: 'contact-1',
    normalized_phone: '+14085550100',
    normalized_email: 'person@example.com',
    first_name: 'Alex',
    last_name: 'Customer',
    display_name: 'Alex Customer',
    raw_phone: '(408) 555-0100',
    raw_email: 'person@example.com',
    quo_contact_id: null,
    quo_tags: [],
    created_at_ms: 1_000,
    updated_at_ms: 1_000,
  };
}

function makeLeadRecord(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    lead_record_id: 'lead-1',
    journey_id: 'journey-1',
    contact_id: 'contact-1',
    status: 'qualified',
    capture_channel: 'form',
    title: 'Seat repair',
    vehicle: '1969 Camaro',
    service: 'seat-repair',
    project_summary: 'Seat tear',
    customer_message: 'Seat tear',
    customer_language: 'en',
    attribution: {
      gclid: 'gclid-1',
      gbraid: null,
      wbraid: null,
      msclkid: null,
      fbclid: null,
      ttclid: null,
      li_fat_id: null,
      epik: null,
      sc_click_id: null,
      yelp_lead_id: null,
      fbp: null,
      fbc: null,
      ttp: null,
      scid: null,
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'spring',
      utm_term: null,
      utm_content: null,
      first_touch_ts: null,
      last_touch_ts: null,
      landing_page: '/en/request-a-quote/',
      referrer: null,
      referrer_host: null,
      device_type: 'mobile',
      source_platform: 'google_ads',
      acquisition_class: 'paid',
      click_id_type: 'gclid',
    },
    latest_outreach: {
      channel: null,
      status: 'not_attempted',
      provider: null,
      external_id: null,
      error: null,
      sent_at_ms: null,
    },
    qualification: {
      qualified: true,
      qualified_at_ms: 2_000,
    },
    first_action: 'form_submit',
    latest_action: 'form_submit',
    action_types: ['form_submit'],
    action_count: 1,
    created_at_ms: 1_000,
    updated_at_ms: 2_000,
    ...overrides,
  };
}

function createRepos() {
  const contacts = new Map<string, LeadContact>([['contact-1', makeContact()]]);
  const decisions = new Map<string, LeadConversionDecision>();
  const outbox = new Map<string, LeadConversionFeedbackOutboxItem>();
  const outcomes: LeadConversionFeedbackOutcome[] = [];
  const destinations = new Map<string, ProviderConversionDestination>();
  const outboxPutIds: string[] = [];

  const repos: LeadPlatformRepos = {
    contacts: {
      getById: async (contactId) => contacts.get(contactId) ?? null,
      findByNormalizedPhone: async () => null,
      findByNormalizedEmail: async () => null,
      findByQuoContactId: async () => null,
      put: async (contact) => {
        contacts.set(contact.contact_id, contact);
      },
    },
    journeys: {
      getById: async () => null,
      listPage: async () => ({ items: [] as Journey[] }),
      put: async () => undefined,
    },
    journeyEvents: {
      append: async () => undefined,
      appendMany: async () => undefined,
      getBySortKey: async () => null,
      listByJourneyId: async () => [] as JourneyEvent[],
      listByLeadRecordId: async () => [] as JourneyEvent[],
      scanPage: async () => ({ items: [] as JourneyEvent[] }),
    },
    followupWork: {
      acquireLease: async () => false,
      getByIdempotencyKey: async () => null,
      listByStatus: async () => [],
      put: async () => undefined,
      putIfAbsent: async () => true,
    },
    leadRecords: {
      getById: async () => null,
      listByContactId: async () => [],
      listByStatus: async () => [],
      listPage: async () => ({ items: [] }),
      put: async () => undefined,
    },
    conversionDecisions: {
      getById: async (decisionId) => decisions.get(decisionId) ?? null,
      listByLeadRecordId: async (leadRecordId) =>
        mapValues(decisions).filter((decision) => decision.lead_record_id === leadRecordId),
      put: async (decision) => {
        decisions.set(decision.decision_id, decision);
      },
    },
    conversionFeedbackOutbox: {
      getById: async (outboxId) => outbox.get(outboxId) ?? null,
      acquireLease: async ({ outboxId, leaseOwner, leaseExpiresAtMs, nowMs, statusReason }) => {
        const item = outbox.get(outboxId);
        if (!item || item.status !== 'queued') return null;
        const leased = {
          ...item,
          lease_owner: leaseOwner,
          lease_expires_at_ms: leaseExpiresAtMs,
          attempt_count: item.attempt_count + 1,
          status_reason: statusReason,
          updated_at_ms: nowMs,
        };
        outbox.set(outboxId, leased);
        return leased;
      },
      listByDecisionId: async (decisionId) =>
        mapValues(outbox).filter((item) => item.decision_id === decisionId),
      listByLeadRecordId: async (leadRecordId) =>
        mapValues(outbox).filter((item) => item.lead_record_id === leadRecordId),
      listByStatus: async (status) => mapValues(outbox).filter((item) => item.status === status),
      put: async (item) => {
        outboxPutIds.push(item.outbox_id);
        outbox.set(item.outbox_id, item);
      },
    },
    conversionFeedbackOutcomes: {
      append: async (outcome) => {
        outcomes.push(outcome);
      },
      listByLeadRecordId: async (leadRecordId) =>
        outcomes.filter((outcome) => outcome.lead_record_id === leadRecordId),
      listByOutboxId: async (outboxId) =>
        outcomes.filter((outcome) => outcome.outbox_id === outboxId),
    },
    providerConversionDestinations: {
      getByKey: async (destinationKey) => destinations.get(destinationKey) ?? null,
      listEnabled: async () => mapValues(destinations).filter((destination) => destination.enabled),
      put: async (destination) => {
        destinations.set(destination.destination_key, destination);
      },
    },
  };

  return { repos, decisions, outbox, outcomes, destinations, outboxPutIds };
}

test('resolveProviderConversionDestinations persists configured destinations when requested', async () => {
  const { repos, destinations } = createRepos();

  const resolved = await resolveProviderConversionDestinations({
    repo: repos.providerConversionDestinations,
    configuredDestinationKeys: 'google_ads,microsoft_ads',
    nowMs: 3_000,
    persistConfiguredDestinations: true,
  });

  assert.deepEqual(
    resolved.map((destination) => destination.destination_key),
    ['google_ads', 'microsoft_ads'],
  );
  assert.equal(destinations.get('google_ads')?.destination_label, 'Google Ads');
  assert.equal(destinations.get('microsoft_ads')?.delivery_mode, 'provider_api');
});

test('createManagedConversionDecisionForLead creates one durable decision and eligible outbox item', async () => {
  const { repos, decisions, outbox } = createRepos();
  const destinations = await resolveProviderConversionDestinations({
    repo: repos.providerConversionDestinations,
    configuredDestinationKeys: ['google_ads'],
    nowMs: 3_000,
    persistConfiguredDestinations: true,
  });

  const result = await createManagedConversionDecisionForLead({
    repos,
    leadRecord: makeLeadRecord(),
    contact: makeContact(),
    destinations,
    occurredAtMs: 4_000,
    actor: 'admin',
  });

  assert.equal(result.summary.status, 'ready');
  assert.equal(decisions.size, 1);
  assert.equal(outbox.size, 1);
  const item = mapValues(outbox)[0];
  assert.equal(item.destination_key, 'google_ads');
  assert.equal(item.status, 'queued');
  assert.deepEqual(item.signal_keys, ['gclid', 'email', 'phone']);
});

test('createManagedConversionDecisionForLead is idempotent for repeated qualification', async () => {
  const { repos, outbox, outboxPutIds } = createRepos();
  const destinations = await resolveProviderConversionDestinations({
    repo: repos.providerConversionDestinations,
    configuredDestinationKeys: ['google_ads'],
    nowMs: 3_000,
    persistConfiguredDestinations: true,
  });
  const args = {
    repos,
    leadRecord: makeLeadRecord(),
    contact: makeContact(),
    destinations,
    occurredAtMs: 4_000,
    actor: 'admin' as const,
  };

  await createManagedConversionDecisionForLead(args);
  await createManagedConversionDecisionForLead({ ...args, occurredAtMs: 5_000 });

  assert.equal(outbox.size, 1);
  assert.equal(outboxPutIds.length, 1);
});

test('createManagedConversionDecisionForLead records decision without outbox when config is missing', async () => {
  const { repos, decisions, outbox } = createRepos();

  const result = await createManagedConversionDecisionForLead({
    repos,
    leadRecord: makeLeadRecord(),
    contact: makeContact(),
    destinations: [],
    occurredAtMs: 4_000,
    actor: 'admin',
  });

  assert.equal(result.summary.status, 'needs_destination_config');
  assert.equal(decisions.size, 1);
  assert.equal(outbox.size, 0);
});

test('suppressManagedConversionFeedbackForLead suppresses queued items and appends outcome', async () => {
  const { repos, outbox, outcomes } = createRepos();
  const destinations = await resolveProviderConversionDestinations({
    repo: repos.providerConversionDestinations,
    configuredDestinationKeys: ['google_ads'],
    nowMs: 3_000,
    persistConfiguredDestinations: true,
  });

  await createManagedConversionDecisionForLead({
    repos,
    leadRecord: makeLeadRecord(),
    contact: makeContact(),
    destinations,
    occurredAtMs: 4_000,
    actor: 'admin',
  });
  await suppressManagedConversionFeedbackForLead({
    repos,
    leadRecord: makeLeadRecord(),
    occurredAtMs: 5_000,
    reason: 'Lead was unqualified by admin.',
  });

  assert.equal(mapValues(outbox)[0].status, 'suppressed');
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].status, 'suppressed');
});
