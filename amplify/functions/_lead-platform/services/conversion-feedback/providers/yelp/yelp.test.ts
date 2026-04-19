import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type {
  LeadConversionDecision,
  LeadConversionFeedbackOutboxItem,
  ProviderConversionDestination,
} from '../../../../domain/conversion-feedback.ts';
import type { LeadContact } from '../../../../domain/contact.ts';
import type { LeadRecord } from '../../../../domain/lead-record.ts';
import type { ProviderHttpClient } from '../../provider-http.ts';
import {
  buildYelpConversionPayload,
  createYelpManagedConversionAdapter,
  parseYelpManagedConversionConfig,
} from './index.ts';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeLeadRecord(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    lead_record_id: 'lead-1',
    journey_id: 'journey-1',
    contact_id: 'contact-1',
    status: 'qualified',
    capture_channel: 'form',
    title: 'Boat cushion repair',
    vehicle: 'boat cushions',
    service: 'boat-upholstery',
    project_summary: 'Marine vinyl work',
    customer_message: 'Need cushions repaired',
    customer_language: 'en',
    attribution: {
      gclid: null,
      gbraid: null,
      wbraid: null,
      msclkid: null,
      fbclid: null,
      ttclid: null,
      li_fat_id: null,
      epik: null,
      sc_click_id: null,
      yelp_lead_id: 'yelp-lead-123',
      fbp: null,
      fbc: null,
      ttp: null,
      scid: null,
      utm_source: 'yelp',
      utm_medium: 'paid',
      utm_campaign: 'marine',
      utm_term: null,
      utm_content: null,
      first_touch_ts: null,
      last_touch_ts: null,
      landing_page: '/en/boat-upholstery/',
      referrer: null,
      referrer_host: null,
      device_type: 'mobile',
      source_platform: 'yelp_ads',
      acquisition_class: 'paid',
      click_id_type: 'yelp_lead_id',
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
      qualified_at_ms: 1_700_000_000_000,
    },
    first_action: 'form_submit',
    latest_action: 'form_submit',
    action_types: ['form_submit'],
    action_count: 1,
    created_at_ms: 1_700_000_000_000,
    updated_at_ms: 1_700_000_000_000,
    ...overrides,
  };
}

function makeContact(overrides: Partial<LeadContact> = {}): LeadContact {
  return {
    contact_id: 'contact-1',
    normalized_phone: '+14085550100',
    normalized_email: 'Person@Example.com',
    first_name: 'Alex',
    last_name: 'Customer',
    display_name: 'Alex Customer',
    raw_phone: '(408) 555-0100',
    raw_email: 'Person@Example.com',
    quo_contact_id: null,
    quo_tags: [],
    created_at_ms: 1_700_000_000_000,
    updated_at_ms: 1_700_000_000_000,
    ...overrides,
  };
}

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
    occurred_at_ms: 1_700_000_000_000,
    created_at_ms: 1_700_000_000_000,
    updated_at_ms: 1_700_000_000_000,
    ...overrides,
  };
}

function makeOutboxItem(): LeadConversionFeedbackOutboxItem {
  return {
    outbox_id: 'conversion_feedback_yelp123',
    decision_id: 'decision-1',
    lead_record_id: 'lead-1',
    journey_id: 'journey-1',
    destination_key: 'yelp_ads',
    destination_label: 'Yelp Ads',
    status: 'queued',
    status_reason: 'Queued.',
    signal_keys: ['yelp_lead_id', 'email', 'phone'],
    dedupe_key: 'decision-1:yelp_ads',
    payload_contract: 'craigs-managed-conversions-v1',
    attempt_count: 1,
    lease_owner: 'worker-1',
    lease_expires_at_ms: 1_700_000_300_000,
    next_attempt_at_ms: 1_700_000_000_000,
    last_outcome_at_ms: null,
    created_at_ms: 1_700_000_000_000,
    updated_at_ms: 1_700_000_000_000,
  };
}

function makeDestination(
  overrides: Partial<ProviderConversionDestination> = {},
): ProviderConversionDestination {
  return {
    destination_key: 'yelp_ads',
    destination_label: 'Yelp Ads',
    enabled: true,
    delivery_mode: 'provider_api',
    config_source: 'environment',
    provider_config: {},
    created_at_ms: 1,
    updated_at_ms: 1,
    ...overrides,
  };
}

test('parseYelpManagedConversionConfig normalizes framework configuration', () => {
  const config = parseYelpManagedConversionConfig({
    YELP_CONVERSION_FEEDBACK_MODE: 'test_event',
    YELP_CONVERSION_ENDPOINT_BASE: 'https://example.test',
    YELP_CONVERSION_API_KEY: 'secret',
    YELP_CONVERSION_DEFAULT_EVENT_NAME: 'custom_quote_request',
    YELP_CONVERSION_ACTION_SOURCE: 'physical_store',
    YELP_CONVERSION_CURRENCY_CODE: 'cad',
  });

  assert.equal(config.mode, 'test');
  assert.equal(config.endpointBase, 'https://example.test');
  assert.equal(config.apiKey, 'secret');
  assert.equal(config.defaultEventName, 'custom_quote_request');
  assert.equal(config.actionSource, 'physical_store');
  assert.equal(config.currencyCode, 'CAD');
});

test('buildYelpConversionPayload creates a Yelp CAPI event with hashed identifiers', () => {
  const result = buildYelpConversionPayload({
    config: parseYelpManagedConversionConfig({
      YELP_CONVERSION_FEEDBACK_MODE: 'dry_run',
      YELP_CONVERSION_CURRENCY_CODE: 'USD',
    }),
    item: makeOutboxItem(),
    decision: makeDecision(),
    leadRecord: makeLeadRecord(),
    contact: makeContact(),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.test_event, false);
  assert.equal(result.request.event.event_id, 'conversion_feedback_yelp123');
  assert.equal(result.request.event.event_time, 1_700_000_000);
  assert.equal(result.request.event.event_name, 'lead');
  assert.equal(result.request.event.action_source, 'website');
  assert.equal(result.request.event.user_data?.lead_id, 'yelp-lead-123');
  assert.deepEqual(result.request.event.user_data?.em, [sha256('person@example.com')]);
  assert.deepEqual(result.request.event.user_data?.ph, [sha256('14085550100')]);
  assert.equal(result.request.event.user_data?.fn, sha256('alex'));
  assert.equal(result.request.event.user_data?.ln, sha256('customer'));
  assert.equal(result.request.event.custom_data.order_id, 'conversion_feedback_yelp123');
  assert.equal(result.request.event.custom_data.content_category, 'boat-upholstery');
  assert.deepEqual(result.signalKeys, ['email', 'phone', 'yelp_lead_id']);
});

test('buildYelpConversionPayload blocks leads without Yelp-compatible signals', () => {
  const result = buildYelpConversionPayload({
    config: parseYelpManagedConversionConfig({}),
    item: makeOutboxItem(),
    decision: makeDecision(),
    leadRecord: makeLeadRecord({ attribution: null }),
    contact: null,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 'needs_signal');
    assert.equal(result.errorCode, 'yelp_missing_signal');
  }
});

test('createYelpManagedConversionAdapter dry-runs without provider API upload', async () => {
  let called = false;
  const adapter = createYelpManagedConversionAdapter({
    env: {
      YELP_CONVERSION_FEEDBACK_MODE: 'dry_run',
    },
    httpClient: async () => {
      called = true;
      throw new Error('should not call provider in dry run');
    },
  });

  const result = await adapter.deliver({
    item: makeOutboxItem(),
    decision: makeDecision(),
    destination: makeDestination(),
    leadRecord: makeLeadRecord(),
    contact: makeContact(),
    nowMs: 1_700_000_000_000,
  });

  assert.equal(called, false);
  assert.equal(result.status, 'validated');
  assert.equal(result.payload?.mode, 'dry_run');
});

test('createYelpManagedConversionAdapter sends test events through Yelp API client', async () => {
  const calls: Array<{
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown> | string;
  }> = [];
  const httpClient: ProviderHttpClient = async (request) => {
    calls.push({ url: request.url, headers: request.headers, body: request.body });
    return {
      status: 202,
      ok: true,
      headers: { 'request-id': 'yelp-request-1' },
      body: {},
      text: '{}',
    };
  };
  const adapter = createYelpManagedConversionAdapter({
    env: {
      YELP_CONVERSION_FEEDBACK_MODE: 'test',
      YELP_CONVERSION_API_KEY: 'yelp-key',
    },
    httpClient,
  });

  const result = await adapter.deliver({
    item: makeOutboxItem(),
    decision: makeDecision(),
    destination: makeDestination(),
    leadRecord: makeLeadRecord(),
    contact: makeContact(),
    nowMs: 1_700_000_000_000,
  });

  assert.equal(result.status, 'validated');
  assert.equal(result.providerResponseId, 'yelp-request-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.yelp.com/v3/conversion/event');
  assert.equal(calls[0].headers.authorization, 'Bearer yelp-key');
  assert.equal((calls[0].body as Record<string, unknown>).test_event, true);
});

test('createYelpManagedConversionAdapter maps live acceptance and retryable failures', async () => {
  const acceptedAdapter = createYelpManagedConversionAdapter({
    env: {
      YELP_CONVERSION_FEEDBACK_MODE: 'live',
      YELP_CONVERSION_API_KEY: 'yelp-key',
    },
    httpClient: async () => ({
      status: 202,
      ok: true,
      headers: {},
      body: {},
      text: '{}',
    }),
  });
  const accepted = await acceptedAdapter.deliver({
    item: makeOutboxItem(),
    decision: makeDecision(),
    destination: makeDestination(),
    leadRecord: makeLeadRecord(),
    contact: makeContact(),
    nowMs: 1_700_000_000_000,
  });
  assert.equal(accepted.status, 'accepted');

  const failedAdapter = createYelpManagedConversionAdapter({
    env: {
      YELP_CONVERSION_FEEDBACK_MODE: 'live',
      YELP_CONVERSION_API_KEY: 'yelp-key',
    },
    httpClient: async () => ({
      status: 429,
      ok: false,
      headers: {},
      body: { error: { description: 'rate limited' } },
      text: '{}',
    }),
  });
  const failed = await failedAdapter.deliver({
    item: makeOutboxItem(),
    decision: makeDecision(),
    destination: makeDestination(),
    leadRecord: makeLeadRecord(),
    contact: makeContact(),
    nowMs: 1_700_000_000_000,
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.retryable, true);
});
