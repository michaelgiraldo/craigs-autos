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
import { createGoogleAdsManagedConversionAdapter } from './adapter.ts';
import { parseGoogleAdsManagedConversionConfig } from './config.ts';
import { buildGoogleAdsUploadClickConversionsPayload } from './payload.ts';

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
    normalized_email: 'Jane.Doe+Boat@gmail.com',
    first_name: 'Alex',
    last_name: 'Customer',
    display_name: 'Alex Customer',
    raw_phone: '(408) 555-0100',
    raw_email: 'Jane.Doe+Boat@gmail.com',
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

function makeDestination(
  overrides: Partial<ProviderConversionDestination> = {},
): ProviderConversionDestination {
  return {
    destination_key: 'google_ads',
    destination_label: 'Google Ads',
    enabled: true,
    delivery_mode: 'provider_api',
    config_source: 'environment',
    provider_config: {},
    created_at_ms: 1,
    updated_at_ms: 1,
    ...overrides,
  };
}

test('parseGoogleAdsManagedConversionConfig normalizes provider SDK configuration', () => {
  const config = parseGoogleAdsManagedConversionConfig({
    GOOGLE_ADS_CONVERSION_FEEDBACK_MODE: 'validate_only',
    GOOGLE_ADS_CUSTOMER_ID: '123-456-7890',
    GOOGLE_ADS_CONVERSION_ACTION_ID: '987654321',
    GOOGLE_ADS_DEFAULT_CONVERSION_VALUE: '25',
    GOOGLE_ADS_CURRENCY_CODE: 'usd',
    GOOGLE_ADS_AD_USER_DATA_CONSENT: 'granted',
    GOOGLE_ADS_ACCESS_TOKEN: 'access',
    GOOGLE_ADS_DEVELOPER_TOKEN: 'developer',
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: '999-000-1111',
  });

  assert.equal(config.mode, 'test');
  assert.equal(config.customerId, '1234567890');
  assert.equal(config.conversionActionId, '987654321');
  assert.equal(config.defaultConversionValue, 25);
  assert.equal(config.currencyCode, 'USD');
  assert.equal(config.adUserDataConsent, 'GRANTED');
  assert.equal(config.loginCustomerId, '9990001111');
});

test('buildGoogleAdsUploadClickConversionsPayload creates a REST ClickConversion payload', () => {
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
  const conversion = result.request.body.conversions[0];
  assert.equal(result.request.customerId, '1234567890');
  assert.equal(result.request.body.partialFailure, true);
  assert.equal(result.request.body.validateOnly, false);
  assert.equal(conversion.conversionAction, 'customers/1234567890/conversionActions/987654321');
  assert.equal(conversion.conversionDateTime, '2023-11-14 22:13:20+00:00');
  assert.equal(conversion.conversionEnvironment, 'WEB');
  assert.equal(conversion.orderId, 'conversion_feedback_abc123');
  assert.equal(conversion.gclid, 'gclid-1');
  assert.equal(conversion.conversionValue, 25);
  assert.equal(conversion.currencyCode, 'USD');
  assert.deepEqual(conversion.consent, { adUserData: 'GRANTED' });
  assert.deepEqual(conversion.userIdentifiers, [
    { hashedEmail: sha256('janedoe@gmail.com') },
    { hashedPhoneNumber: sha256('+14085550100') },
  ]);
  assert.deepEqual(result.signalKeys, ['gclid', 'email', 'phone']);
});

test('buildGoogleAdsUploadClickConversionsPayload blocks missing config and missing signal', () => {
  const missingConfig = buildGoogleAdsUploadClickConversionsPayload({
    config: parseGoogleAdsManagedConversionConfig({}),
    item: makeOutboxItem(),
    decision: makeDecision(),
    leadRecord: makeLeadRecord(),
    contact: makeContact(),
  });

  assert.equal(missingConfig.ok, false);
  if (!missingConfig.ok) {
    assert.equal(missingConfig.status, 'needs_destination_config');
    assert.deepEqual(missingConfig.missingConfigKeys, [
      'GOOGLE_ADS_CUSTOMER_ID',
      'GOOGLE_ADS_CONVERSION_ACTION_RESOURCE_NAME or GOOGLE_ADS_CONVERSION_ACTION_ID',
      'GOOGLE_ADS_AD_USER_DATA_CONSENT or GOOGLE_ADS_ACCOUNT_DEFAULT_CONSENT_CONFIGURED',
    ]);
  }

  const missingSignal = buildGoogleAdsUploadClickConversionsPayload({
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

  assert.equal(missingSignal.ok, false);
  if (!missingSignal.ok) assert.equal(missingSignal.status, 'needs_signal');
});

test('createGoogleAdsManagedConversionAdapter dry-runs without provider API upload', async () => {
  let called = false;
  const adapter = createGoogleAdsManagedConversionAdapter({
    env: {
      GOOGLE_ADS_CONVERSION_FEEDBACK_MODE: 'dry_run',
      GOOGLE_ADS_CUSTOMER_ID: '1234567890',
      GOOGLE_ADS_CONVERSION_ACTION_RESOURCE_NAME:
        'customers/1234567890/conversionActions/987654321',
      GOOGLE_ADS_ACCOUNT_DEFAULT_CONSENT_CONFIGURED: 'true',
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

test('createGoogleAdsManagedConversionAdapter sends validate-only test requests through the provider client', async () => {
  const calls: Array<{
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown> | string;
  }> = [];
  const httpClient: ProviderHttpClient = async (request) => {
    calls.push({ url: request.url, headers: request.headers, body: request.body });
    return {
      status: 200,
      ok: true,
      headers: { 'request-id': 'google-request-1' },
      body: {},
      text: '{}',
    };
  };
  const adapter = createGoogleAdsManagedConversionAdapter({
    env: {
      GOOGLE_ADS_CONVERSION_FEEDBACK_MODE: 'test',
      GOOGLE_ADS_CUSTOMER_ID: '1234567890',
      GOOGLE_ADS_CONVERSION_ACTION_ID: '987654321',
      GOOGLE_ADS_ACCOUNT_DEFAULT_CONSENT_CONFIGURED: 'true',
      GOOGLE_ADS_ACCESS_TOKEN: 'access-token',
      GOOGLE_ADS_DEVELOPER_TOKEN: 'developer-token',
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: '9990001111',
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
  assert.equal(result.providerResponseId, 'google-request-1');
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://googleads.googleapis.com/v22/customers/1234567890:uploadClickConversions',
  );
  assert.equal(calls[0].headers.authorization, 'Bearer access-token');
  assert.equal(calls[0].headers['developer-token'], 'developer-token');
  assert.equal(calls[0].headers['login-customer-id'], '9990001111');
  assert.equal((calls[0].body as Record<string, unknown>).validateOnly, true);
});

test('createGoogleAdsManagedConversionAdapter refreshes OAuth access tokens for provider delivery', async () => {
  const calls: Array<{
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown> | string;
  }> = [];
  const httpClient: ProviderHttpClient = async (request) => {
    calls.push({ url: request.url, headers: request.headers, body: request.body });
    if (request.url === 'https://oauth2.googleapis.com/token') {
      return {
        status: 200,
        ok: true,
        headers: {} as Record<string, string>,
        body: { access_token: 'fresh-access-token', expires_in: 3600 },
        text: '{}',
      };
    }
    return {
      status: 200,
      ok: true,
      headers: { 'request-id': 'google-request-refresh' },
      body: {},
      text: '{}',
    };
  };
  const adapter = createGoogleAdsManagedConversionAdapter({
    env: {
      GOOGLE_ADS_CONVERSION_FEEDBACK_MODE: 'test',
      GOOGLE_ADS_CUSTOMER_ID: '1234567890',
      GOOGLE_ADS_CONVERSION_ACTION_ID: '987654321',
      GOOGLE_ADS_ACCOUNT_DEFAULT_CONSENT_CONFIGURED: 'true',
      GOOGLE_ADS_REFRESH_TOKEN: 'refresh-token',
      GOOGLE_ADS_CLIENT_ID: 'client-id',
      GOOGLE_ADS_CLIENT_SECRET: 'client-secret',
      GOOGLE_ADS_DEVELOPER_TOKEN: 'developer-token',
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
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.match(calls[0].body as string, /grant_type=refresh_token/);
  assert.equal(calls[1].headers.authorization, 'Bearer fresh-access-token');
  assert.equal(result.payload?.access_token_refreshed, true);
});

test('createGoogleAdsManagedConversionAdapter maps live provider acceptance and retryable failures', async () => {
  const acceptedAdapter = createGoogleAdsManagedConversionAdapter({
    env: {
      GOOGLE_ADS_CONVERSION_FEEDBACK_MODE: 'live',
      GOOGLE_ADS_CUSTOMER_ID: '1234567890',
      GOOGLE_ADS_CONVERSION_ACTION_ID: '987654321',
      GOOGLE_ADS_ACCOUNT_DEFAULT_CONSENT_CONFIGURED: 'true',
      GOOGLE_ADS_ACCESS_TOKEN: 'access-token',
      GOOGLE_ADS_DEVELOPER_TOKEN: 'developer-token',
    },
    httpClient: async () => ({
      status: 200,
      ok: true,
      headers: { 'request-id': 'google-request-2' },
      body: { results: [{ gclid: 'gclid-1' }] },
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

  const failedAdapter = createGoogleAdsManagedConversionAdapter({
    env: {
      GOOGLE_ADS_CONVERSION_FEEDBACK_MODE: 'live',
      GOOGLE_ADS_CUSTOMER_ID: '1234567890',
      GOOGLE_ADS_CONVERSION_ACTION_ID: '987654321',
      GOOGLE_ADS_ACCOUNT_DEFAULT_CONSENT_CONFIGURED: 'true',
      GOOGLE_ADS_ACCESS_TOKEN: 'access-token',
      GOOGLE_ADS_DEVELOPER_TOKEN: 'developer-token',
    },
    httpClient: async () => ({
      status: 503,
      ok: false,
      headers: {},
      body: { error: { message: 'unavailable' } },
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
