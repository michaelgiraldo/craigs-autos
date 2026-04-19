import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type {
  LeadConversionDecision,
  LeadConversionFeedbackOutboxItem,
} from '../domain/conversion-feedback.ts';
import type { LeadContact } from '../domain/contact.ts';
import type { LeadRecord } from '../domain/lead-record.ts';
import {
  buildGoogleAdsUploadClickConversionsPayload,
  createGoogleAdsManagedConversionAdapter,
  hashGoogleAdsUserValue,
  parseGoogleAdsManagedConversionConfig,
} from './google-ads-conversion-feedback.ts';

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
    normalized_email: 'person@example.com',
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
    outbox_id: 'conversion_feedback_abc123',
    decision_id: 'decision-1',
    lead_record_id: 'lead-1',
    journey_id: 'journey-1',
    destination_key: 'google_ads',
    destination_label: 'Google Ads',
    status: 'queued',
    status_reason: 'Queued.',
    signal_keys: ['gclid', 'email', 'phone'],
    dedupe_key: 'decision-1:google_ads',
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

test('hashGoogleAdsUserValue normalizes and hashes first-party identifiers', () => {
  assert.equal(hashGoogleAdsUserValue(' Person@Example.COM '), sha256('person@example.com'));
  assert.equal(hashGoogleAdsUserValue(' +14085550100 '), sha256('+14085550100'));
});

test('parseGoogleAdsManagedConversionConfig normalizes dry-run env configuration', () => {
  const config = parseGoogleAdsManagedConversionConfig({
    GOOGLE_ADS_CONVERSION_FEEDBACK_MODE: 'dry_run',
    GOOGLE_ADS_CUSTOMER_ID: '123-456-7890',
    GOOGLE_ADS_CONVERSION_ACTION_ID: '987654321',
    GOOGLE_ADS_DEFAULT_CONVERSION_VALUE: '25',
    GOOGLE_ADS_CURRENCY_CODE: 'usd',
    GOOGLE_ADS_AD_USER_DATA_CONSENT: 'granted',
  });

  assert.equal(config.mode, 'dry_run');
  assert.equal(config.customerId, '1234567890');
  assert.equal(config.conversionActionId, '987654321');
  assert.equal(config.defaultConversionValue, 25);
  assert.equal(config.currencyCode, 'USD');
  assert.equal(config.adUserDataConsent, 'GRANTED');
});

test('buildGoogleAdsUploadClickConversionsPayload creates a dry-safe ClickConversion payload', () => {
  const result = buildGoogleAdsUploadClickConversionsPayload({
    config: parseGoogleAdsManagedConversionConfig({
      GOOGLE_ADS_CONVERSION_FEEDBACK_MODE: 'dry_run',
      GOOGLE_ADS_CUSTOMER_ID: '1234567890',
      GOOGLE_ADS_CONVERSION_ACTION_ID: '987654321',
      GOOGLE_ADS_DEFAULT_CONVERSION_VALUE: '25',
      GOOGLE_ADS_CURRENCY_CODE: 'USD',
      GOOGLE_ADS_AD_USER_DATA_CONSENT: 'GRANTED',
    }),
    item: makeOutboxItem(),
    decision: makeDecision(),
    leadRecord: makeLeadRecord(),
    contact: makeContact(),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const conversion = result.payload.conversions[0];
  assert.equal(result.payload.customer_id, '1234567890');
  assert.equal(result.payload.partial_failure, true);
  assert.equal(result.payload.validate_only, false);
  assert.equal(conversion.conversion_action, 'customers/1234567890/conversionActions/987654321');
  assert.equal(conversion.conversion_date_time, '2023-11-14 22:13:20+00:00');
  assert.equal(conversion.conversion_environment, 'WEB');
  assert.equal(conversion.order_id, 'conversion_feedback_abc123');
  assert.equal(conversion.gclid, 'gclid-1');
  assert.equal(conversion.conversion_value, 25);
  assert.equal(conversion.currency_code, 'USD');
  assert.deepEqual(conversion.consent, { ad_user_data: 'GRANTED' });
  assert.deepEqual(conversion.user_identifiers, [
    { hashed_email: sha256('person@example.com') },
    { hashed_phone_number: sha256('+14085550100') },
  ]);
  assert.deepEqual(result.signalKeys, ['gclid', 'email', 'phone']);
});

test('buildGoogleAdsUploadClickConversionsPayload blocks missing config before upload', () => {
  const result = buildGoogleAdsUploadClickConversionsPayload({
    config: parseGoogleAdsManagedConversionConfig({}),
    item: makeOutboxItem(),
    decision: makeDecision(),
    leadRecord: makeLeadRecord(),
    contact: makeContact(),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 'needs_destination_config');
  assert.equal(result.errorCode, 'google_ads_missing_config');
  assert.deepEqual(result.missingConfigKeys, [
    'GOOGLE_ADS_CUSTOMER_ID',
    'GOOGLE_ADS_CONVERSION_ACTION_RESOURCE_NAME or GOOGLE_ADS_CONVERSION_ACTION_ID',
    'GOOGLE_ADS_AD_USER_DATA_CONSENT or GOOGLE_ADS_ACCOUNT_DEFAULT_CONSENT_CONFIGURED',
  ]);
});

test('buildGoogleAdsUploadClickConversionsPayload blocks leads without usable signals', () => {
  const result = buildGoogleAdsUploadClickConversionsPayload({
    config: parseGoogleAdsManagedConversionConfig({
      GOOGLE_ADS_CUSTOMER_ID: '1234567890',
      GOOGLE_ADS_CONVERSION_ACTION_ID: '987654321',
      GOOGLE_ADS_ACCOUNT_DEFAULT_CONSENT_CONFIGURED: 'true',
    }),
    item: makeOutboxItem(),
    decision: makeDecision(),
    leadRecord: makeLeadRecord({ attribution: null }),
    contact: null,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 'needs_signal');
  assert.equal(result.errorCode, 'google_ads_missing_signal');
});

test('createGoogleAdsManagedConversionAdapter validates payloads without provider API upload', async () => {
  const adapter = createGoogleAdsManagedConversionAdapter(
    parseGoogleAdsManagedConversionConfig({
      GOOGLE_ADS_CONVERSION_FEEDBACK_MODE: 'dry_run',
      GOOGLE_ADS_CUSTOMER_ID: '1234567890',
      GOOGLE_ADS_CONVERSION_ACTION_RESOURCE_NAME:
        'customers/1234567890/conversionActions/987654321',
      GOOGLE_ADS_ACCOUNT_DEFAULT_CONSENT_CONFIGURED: 'true',
    }),
  );

  const result = await adapter.deliver({
    item: makeOutboxItem(),
    decision: makeDecision(),
    destination: {
      destination_key: 'google_ads',
      destination_label: 'Google Ads',
      enabled: true,
      delivery_mode: 'provider_api',
      config_source: 'environment',
      provider_config: {},
      created_at_ms: 1,
      updated_at_ms: 1,
    },
    leadRecord: makeLeadRecord(),
    contact: makeContact(),
    nowMs: 1_700_000_000_000,
  });

  assert.equal(result.status, 'validated');
  assert.equal(result.errorCode, undefined);
  assert.equal(result.payload?.mode, 'dry_run');
  assert.equal(result.payload?.user_identifier_count, 2);
  assert.equal(result.payload?.has_click_id, true);
});
