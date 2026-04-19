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
  createManualConversionFeedbackAdapter,
  processManagedConversionFeedbackBatch,
  type ManagedConversionFeedbackAdapter,
} from './managed-conversion-feedback-worker.ts';

function makeDecision(overrides: Partial<LeadConversionDecision> = {}): LeadConversionDecision {
  return {
    decision_id: 'decision-1',
    lead_record_id: 'lead-1',
    journey_id: 'journey-1',
    decision_type: 'qualified_lead',
    decision_status: 'active',
    actor: 'admin',
    reason: 'Qualified lead.',
    conversion_value: null,
    currency_code: null,
    source_event_id: null,
    occurred_at_ms: 1_000,
    created_at_ms: 1_000,
    updated_at_ms: 1_000,
    ...overrides,
  };
}

function makeDestination(
  overrides: Partial<ProviderConversionDestination> = {},
): ProviderConversionDestination {
  return {
    destination_key: 'manual_export',
    destination_label: 'Manual Export',
    enabled: true,
    delivery_mode: 'manual',
    config_source: 'environment',
    provider_config: {},
    created_at_ms: 1_000,
    updated_at_ms: 1_000,
    ...overrides,
  };
}

function makeOutboxItem(
  overrides: Partial<LeadConversionFeedbackOutboxItem> = {},
): LeadConversionFeedbackOutboxItem {
  return {
    outbox_id: 'outbox-1',
    decision_id: 'decision-1',
    lead_record_id: 'lead-1',
    journey_id: 'journey-1',
    destination_key: 'manual_export',
    destination_label: 'Manual Export',
    status: 'queued',
    status_reason: 'Queued.',
    signal_keys: ['email'],
    dedupe_key: 'decision-1:manual_export',
    payload_contract: 'craigs-managed-conversions-v1',
    attempt_count: 0,
    lease_owner: null,
    lease_expires_at_ms: null,
    next_attempt_at_ms: 2_000,
    last_outcome_at_ms: null,
    created_at_ms: 1_000,
    updated_at_ms: 1_000,
    ...overrides,
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
    attribution: null,
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
      qualified_at_ms: 1_000,
    },
    first_action: 'form_submit',
    latest_action: 'form_submit',
    action_types: ['form_submit'],
    action_count: 1,
    created_at_ms: 1_000,
    updated_at_ms: 1_000,
    ...overrides,
  };
}

function createRepos(args: {
  decision?: LeadConversionDecision | null;
  destination?: ProviderConversionDestination | null;
  item?: LeadConversionFeedbackOutboxItem | null;
  leadRecord?: LeadRecord | null;
}) {
  const contacts = new Map<string, LeadContact>();
  const leadRecords = new Map<string, LeadRecord>();
  const decisions = new Map<string, LeadConversionDecision>();
  const destinations = new Map<string, ProviderConversionDestination>();
  const outbox = new Map<string, LeadConversionFeedbackOutboxItem>();
  const outcomes: LeadConversionFeedbackOutcome[] = [];

  if (args.decision) decisions.set(args.decision.decision_id, args.decision);
  if (args.destination) destinations.set(args.destination.destination_key, args.destination);
  if (args.item) outbox.set(args.item.outbox_id, args.item);
  const leadRecord = args.leadRecord === undefined ? makeLeadRecord() : args.leadRecord;
  if (leadRecord) leadRecords.set(leadRecord.lead_record_id, leadRecord);

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
    leadRecords: {
      getById: async (leadRecordId) => leadRecords.get(leadRecordId) ?? null,
      listByContactId: async () => [],
      listByStatus: async () => [],
      listPage: async () => ({ items: [] }),
      put: async (record) => {
        leadRecords.set(record.lead_record_id, record);
      },
    },
    conversionDecisions: {
      getById: async (decisionId) => decisions.get(decisionId) ?? null,
      listByLeadRecordId: async (leadRecordId) =>
        [...decisions.values()].filter((decision) => decision.lead_record_id === leadRecordId),
      put: async (decision) => {
        decisions.set(decision.decision_id, decision);
      },
    },
    conversionFeedbackOutbox: {
      getById: async (outboxId) => outbox.get(outboxId) ?? null,
      acquireLease: async ({
        outboxId,
        expectedStatus,
        leaseOwner,
        leaseExpiresAtMs,
        nowMs,
        statusReason,
      }) => {
        const item = outbox.get(outboxId);
        if (!item || item.status !== expectedStatus) return null;
        if (typeof item.lease_expires_at_ms === 'number' && item.lease_expires_at_ms > nowMs) {
          return null;
        }
        const leased = {
          ...item,
          attempt_count: item.attempt_count + 1,
          lease_owner: leaseOwner,
          lease_expires_at_ms: leaseExpiresAtMs,
          status_reason: statusReason,
          updated_at_ms: nowMs,
        };
        outbox.set(outboxId, leased);
        return leased;
      },
      listByDecisionId: async (decisionId) =>
        [...outbox.values()].filter((item) => item.decision_id === decisionId),
      listByLeadRecordId: async (leadRecordId) =>
        [...outbox.values()].filter((item) => item.lead_record_id === leadRecordId),
      listByStatus: async (status, options = {}) =>
        [...outbox.values()]
          .filter((item) => item.status === status)
          .filter((item) =>
            typeof options.dueAtMs === 'number'
              ? (item.next_attempt_at_ms ?? Number.POSITIVE_INFINITY) <= options.dueAtMs
              : true,
          )
          .slice(0, options.limit),
      put: async (item) => {
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
      listEnabled: async () =>
        [...destinations.values()].filter((destination) => destination.enabled),
      put: async (destination) => {
        destinations.set(destination.destination_key, destination);
      },
    },
  };

  return { repos, outbox, outcomes };
}

test('processManagedConversionFeedbackBatch marks manual exports without provider upload', async () => {
  const { repos, outbox, outcomes } = createRepos({
    decision: makeDecision(),
    destination: makeDestination(),
    item: makeOutboxItem(),
  });

  const result = await processManagedConversionFeedbackBatch({
    repos,
    nowMs: 2_000,
    workerId: 'worker-1',
    adapters: [createManualConversionFeedbackAdapter()],
  });

  assert.equal(result.processed, 1);
  assert.equal(outbox.get('outbox-1')?.status, 'manual');
  assert.equal(outbox.get('outbox-1')?.lease_owner, null);
  assert.equal(outbox.get('outbox-1')?.attempt_count, 1);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].status, 'manual');
  assert.match(outcomes[0].message ?? '', /no provider API was called/);
});

test('processManagedConversionFeedbackBatch does not pretend provider API destinations are sent without adapters', async () => {
  const { repos, outbox, outcomes } = createRepos({
    decision: makeDecision(),
    destination: makeDestination({
      destination_key: 'google_ads',
      destination_label: 'Google Ads',
      delivery_mode: 'provider_api',
    }),
    item: makeOutboxItem({
      destination_key: 'google_ads',
      destination_label: 'Google Ads',
      dedupe_key: 'decision-1:google_ads',
      signal_keys: ['gclid'],
    }),
  });

  const result = await processManagedConversionFeedbackBatch({
    repos,
    nowMs: 2_000,
    workerId: 'worker-1',
    adapters: [createManualConversionFeedbackAdapter()],
  });

  assert.equal(result.processed, 1);
  assert.equal(outbox.get('outbox-1')?.status, 'needs_destination_config');
  assert.equal(outbox.get('outbox-1')?.next_attempt_at_ms, null);
  assert.equal(outcomes[0].status, 'needs_destination_config');
  assert.equal(outcomes[0].error_code, 'adapter_not_configured');
});

test('processManagedConversionFeedbackBatch retries provider exceptions before final failure', async () => {
  const failingAdapter: ManagedConversionFeedbackAdapter = {
    key: 'google_ads',
    label: 'Google Ads',
    canHandle: (destination) => destination.destination_key === 'google_ads',
    deliver: async () => {
      throw new Error('temporary provider outage');
    },
  };
  const { repos, outbox, outcomes } = createRepos({
    decision: makeDecision(),
    destination: makeDestination({
      destination_key: 'google_ads',
      destination_label: 'Google Ads',
      delivery_mode: 'provider_api',
    }),
    item: makeOutboxItem({
      destination_key: 'google_ads',
      destination_label: 'Google Ads',
      dedupe_key: 'decision-1:google_ads',
      signal_keys: ['gclid'],
    }),
  });

  const result = await processManagedConversionFeedbackBatch({
    repos,
    nowMs: 2_000,
    workerId: 'worker-1',
    adapters: [failingAdapter],
    config: {
      maxAttempts: 3,
      retryDelaysMs: [500],
    },
  });

  assert.equal(result.processed, 1);
  assert.equal(result.outcomes[0].retried, true);
  assert.equal(outbox.get('outbox-1')?.status, 'queued');
  assert.equal(outbox.get('outbox-1')?.attempt_count, 1);
  assert.equal(outbox.get('outbox-1')?.next_attempt_at_ms, 2_500);
  assert.equal(outcomes[0].status, 'failed');
  assert.equal(outcomes[0].error_code, 'adapter_exception');
});

test('processManagedConversionFeedbackBatch stops retrying after max attempts', async () => {
  const failingAdapter: ManagedConversionFeedbackAdapter = {
    key: 'google_ads',
    label: 'Google Ads',
    canHandle: (destination) => destination.destination_key === 'google_ads',
    deliver: async () => {
      throw new Error('permanent provider outage');
    },
  };
  const { repos, outbox } = createRepos({
    decision: makeDecision(),
    destination: makeDestination({
      destination_key: 'google_ads',
      destination_label: 'Google Ads',
      delivery_mode: 'provider_api',
    }),
    item: makeOutboxItem({
      destination_key: 'google_ads',
      destination_label: 'Google Ads',
      dedupe_key: 'decision-1:google_ads',
      signal_keys: ['gclid'],
      attempt_count: 2,
    }),
  });

  const result = await processManagedConversionFeedbackBatch({
    repos,
    nowMs: 2_000,
    workerId: 'worker-1',
    adapters: [failingAdapter],
    config: {
      maxAttempts: 3,
      retryDelaysMs: [500],
    },
  });

  assert.equal(result.outcomes[0].retried, false);
  assert.equal(outbox.get('outbox-1')?.status, 'failed');
  assert.equal(outbox.get('outbox-1')?.next_attempt_at_ms, null);
  assert.equal(outbox.get('outbox-1')?.attempt_count, 3);
});

test('processManagedConversionFeedbackBatch suppresses inactive decisions', async () => {
  const { repos, outbox, outcomes } = createRepos({
    decision: makeDecision({ decision_status: 'suppressed' }),
    destination: makeDestination(),
    item: makeOutboxItem(),
  });

  const result = await processManagedConversionFeedbackBatch({
    repos,
    nowMs: 2_000,
    workerId: 'worker-1',
    adapters: [createManualConversionFeedbackAdapter()],
  });

  assert.equal(result.processed, 1);
  assert.equal(outbox.get('outbox-1')?.status, 'suppressed');
  assert.equal(outcomes[0].error_code, 'decision_suppressed');
});

test('processManagedConversionFeedbackBatch skips active leases and future attempts', async () => {
  const { repos } = createRepos({
    decision: makeDecision(),
    destination: makeDestination(),
    item: makeOutboxItem({
      lease_owner: 'other-worker',
      lease_expires_at_ms: 3_000,
      next_attempt_at_ms: 2_000,
    }),
  });

  const result = await processManagedConversionFeedbackBatch({
    repos,
    nowMs: 2_000,
    workerId: 'worker-1',
    adapters: [createManualConversionFeedbackAdapter()],
    outboxId: 'outbox-1',
  });

  assert.equal(result.processed, 0);
  assert.equal(result.skipped, 1);
});
