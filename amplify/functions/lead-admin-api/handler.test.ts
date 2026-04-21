import assert from 'node:assert/strict';
import test from 'node:test';
import { createLeadAdminHandler } from './handler.ts';
import type {
  LeadAdminFollowupWorkSummary,
  LeadAdminJourneySummary,
  LeadAdminRecordSummary,
} from '../_lead-platform/services/admin.ts';
import type { LeadAdminDeps } from './types.ts';

function authHeader(password: string) {
  return `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;
}

function makeDeps(overrides: Partial<LeadAdminDeps> = {}): LeadAdminDeps {
  return {
    configValid: true,
    adminPassword: 'secret',
    listLeadRecords: async () => ({ items: [] }),
    listJourneys: async () => ({ items: [] }),
    listFollowupWork: async () => ({ items: [] }),
    retryFollowupWork: async () => ({ ok: true, invoked: true }),
    resolveFollowupWorkManually: async () => ({ ok: true }),
    updateLeadRecordQualification: async () => true,
    nowEpochMs: () => 1_000,
    ...overrides,
  };
}

test('lead-admin handler rejects unauthorized requests', async () => {
  const handler = createLeadAdminHandler(makeDeps());

  const result = await handler({
    requestContext: { http: { method: 'GET' } },
    headers: {},
  });

  assert.equal(result.statusCode, 401);
  assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(result.headers['WWW-Authenticate'], 'Basic realm="Admin"');
});

test('lead-admin handler leaves CORS headers to the public API layer', async () => {
  const handler = createLeadAdminHandler(makeDeps());

  const result = await handler({
    requestContext: { http: { method: 'OPTIONS' } },
    headers: { origin: 'https://craigs.autos' },
  });

  assert.equal(result.statusCode, 204);
  assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(result.headers['Access-Control-Allow-Methods'], undefined);
  assert.equal(result.headers['Access-Control-Allow-Headers'], undefined);
});

test('lead-admin handler returns admin pages in repository order for authorized GET', async () => {
  const handler = createLeadAdminHandler(
    makeDeps({
      listLeadRecords: async () => ({
        items: [
          {
            lead_record_id: 'newer',
            journey_id: 'journey-newer',
            created_at_ms: 20,
            status: 'qualified',
            capture_channel: 'form',
            title: 'Newer lead',
            display_name: 'Alex',
            normalized_phone: '+14085550100',
            normalized_email: null,
            device_type: 'mobile',
            source_platform: 'google_ads',
            acquisition_class: 'paid',
            utm_source: 'google',
            utm_medium: 'cpc',
            utm_campaign: 'spring',
            utm_term: 'upholstery',
            utm_content: 'cta_click',
            landing_page: '/en/contact',
            referrer_host: 'google.com',
            click_id_type: 'gclid',
            click_id: 'test-gclid',
            qualified: true,
            conversion_feedback: {
              contract: 'craigs-managed-conversions-v1',
              status: 'needs_destination_config',
              status_label: 'Configure destination',
              reason:
                'Qualified lead has managed-conversion signals, but no feedback destination is configured.',
              configured_destination_keys: [],
              eligible_destination_keys: [],
              candidate_destination_keys: ['google_ads'],
              primary_destination_key: null,
              destination_labels: ['Google Ads'],
              signal_keys: ['gclid', 'phone'],
            },
            conversion_feedback_detail: {
              decisions: [
                {
                  decision_id: 'decision-1',
                  decision_type: 'qualified_lead',
                  decision_status: 'active',
                  actor: 'admin',
                  reason: 'Qualified lead has managed-conversion signals.',
                  conversion_value: null,
                  currency_code: null,
                  occurred_at_ms: 20,
                  updated_at_ms: 20,
                },
              ],
              outbox_items: [
                {
                  outbox_id: 'outbox-1',
                  decision_id: 'decision-1',
                  destination_key: 'google_ads',
                  destination_label: 'Google Ads',
                  status: 'needs_destination_config',
                  status_reason: 'No delivery adapter is configured for Google Ads.',
                  signal_keys: ['gclid', 'phone'],
                  attempt_count: 1,
                  lease_owner: null,
                  lease_expires_at_ms: null,
                  next_attempt_at_ms: null,
                  last_outcome_at_ms: 20,
                  updated_at_ms: 20,
                  latest_outcome: {
                    outbox_id: 'outbox-1',
                    outcome_id: 'outcome-1',
                    status: 'needs_destination_config',
                    message: 'No delivery adapter is configured for Google Ads.',
                    provider_response_id: null,
                    error_code: 'adapter_not_configured',
                    diagnostics_url: null,
                    occurred_at_ms: 20,
                  },
                },
              ],
              outcomes: [
                {
                  outbox_id: 'outbox-1',
                  outcome_id: 'outcome-1',
                  status: 'needs_destination_config',
                  message: 'No delivery adapter is configured for Google Ads.',
                  provider_response_id: null,
                  error_code: 'adapter_not_configured',
                  diagnostics_url: null,
                  occurred_at_ms: 20,
                },
              ],
            },
            outreach_channel: 'sms',
            outreach_status: 'sent',
            first_action: 'form_submit',
            latest_action: 'form_submit',
            action_types: ['form_submit'],
            action_count: 1,
            updated_at_ms: 20,
          },
          {
            lead_record_id: 'older',
            journey_id: 'journey-older',
            created_at_ms: 10,
            status: 'ready_for_outreach',
            capture_channel: 'chat',
            title: 'Older lead',
            display_name: null,
            normalized_phone: null,
            normalized_email: null,
            device_type: null,
            source_platform: null,
            acquisition_class: null,
            utm_source: null,
            utm_medium: null,
            utm_campaign: null,
            utm_term: null,
            utm_content: null,
            landing_page: null,
            referrer_host: null,
            click_id_type: null,
            click_id: null,
            qualified: false,
            conversion_feedback: {
              contract: 'craigs-managed-conversions-v1',
              status: 'not_ready',
              status_label: 'Not ready',
              reason: 'Lead must be qualified before conversion feedback is evaluated.',
              configured_destination_keys: [],
              eligible_destination_keys: [],
              candidate_destination_keys: [],
              primary_destination_key: null,
              destination_labels: [],
              signal_keys: [],
            },
            conversion_feedback_detail: {
              decisions: [],
              outbox_items: [],
              outcomes: [],
            },
            outreach_channel: null,
            outreach_status: 'not_attempted',
            first_action: 'chat_first_message_sent',
            latest_action: 'chat_first_message_sent',
            action_types: ['chat_first_message_sent'],
            action_count: 1,
            updated_at_ms: 10,
          },
        ] satisfies LeadAdminRecordSummary[],
        lastEvaluatedKey: { lead_record_id: 'cursor-id' },
      }),
      listJourneys: async () => ({
        items: [
          {
            journey_id: 'journey-1',
            journey_status: 'incomplete',
            status_reason: null,
            capture_channel: null,
            first_action: 'click_call',
            latest_action: 'click_call',
            action_types: ['click_call'],
            action_count: 1,
            lead_record_id: null,
            device_type: 'mobile',
            source_platform: 'yelp',
            acquisition_class: 'paid',
            landing_page: '/en',
            referrer_host: null,
            lead_user_id: 'anon_123',
            thread_id: null,
            created_at_ms: 25,
            updated_at_ms: 25,
          },
        ] satisfies LeadAdminJourneySummary[],
      }),
      listFollowupWork: async () => ({
        items: [
          {
            idempotency_key: 'form:client-event-1',
            followup_work_id: 'form_abcd',
            source_event_id: 'client-event-1',
            status: 'error',
            capture_channel: 'form',
            lead_record_id: 'newer',
            journey_id: 'journey-newer',
            contact_id: 'contact-1',
            name: 'Alex',
            email: '',
            phone: '+14085550100',
            vehicle: 'Camry',
            service: 'seat repair',
            origin: 'form:submit',
            page_url: 'https://craigs.autos/en/request-a-quote',
            sms_status: 'failed',
            email_status: null,
            owner_email_status: null,
            outreach_result: 'customer_outreach_failed',
            error: 'worker unavailable',
            lock_expires_at: null,
            created_at: 10,
            updated_at: 20,
            age_seconds: 100,
            stale: true,
            retry_allowed: true,
            manual_resolution_allowed: true,
            action_block_reason: null,
            operator_resolution: null,
            operator_resolution_reason: null,
            operator_resolved_at: null,
          },
        ] satisfies LeadAdminFollowupWorkSummary[],
      }),
    }),
  );

  const result = await handler({
    requestContext: { http: { method: 'GET' } },
    headers: { authorization: authHeader('secret') },
  });

  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body) as {
    lead_records: Array<{ lead_record_id: string }>;
    journeys: Array<{ journey_id: string }>;
    followup_work: Array<{ idempotency_key: string }>;
  };
  assert.deepEqual(
    body.lead_records.map((item) => item.lead_record_id),
    ['newer', 'older'],
  );
  assert.deepEqual(
    body.journeys.map((item) => item.journey_id),
    ['journey-1'],
  );
  assert.deepEqual(
    body.followup_work.map((item) => item.idempotency_key),
    ['form:client-event-1'],
  );
});

test('lead-admin handler validates POST payload', async () => {
  const handler = createLeadAdminHandler(makeDeps());

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    headers: { authorization: authHeader('secret') },
    body: JSON.stringify({ lead_record_id: '', qualified: 'yes' }),
  });

  assert.equal(result.statusCode, 400);
  assert.match(result.body, /Missing lead_record_id/);
});

test('lead-admin handler updates lead for authorized POST', async () => {
  const updates: Array<{ leadRecordId: string; qualified: boolean; qualifiedAtMs: number }> = [];

  const handler = createLeadAdminHandler({
    ...makeDeps(),
    updateLeadRecordQualification: async (args) => {
      updates.push(args);
      return true;
    },
    nowEpochMs: () => 1_234,
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    headers: { authorization: authHeader('secret') },
    body: JSON.stringify({ lead_record_id: 'lead-123', qualified: true }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    leadRecordId: 'lead-123',
    qualified: true,
    qualifiedAtMs: 1_234,
  });
});

test('lead-admin handler retries follow-up work for authorized admin requests', async () => {
  const retries: Array<{ idempotencyKey: string; nowEpochSeconds: number }> = [];
  const handler = createLeadAdminHandler(
    makeDeps({
      retryFollowupWork: async (args) => {
        retries.push(args);
        return { ok: true, invoked: true };
      },
      nowEpochMs: () => 12_000,
    }),
  );

  const result = await handler({
    requestContext: {
      http: { method: 'POST', path: '/admin/leads/followup-work/retry' },
    },
    headers: { authorization: authHeader('secret') },
    body: JSON.stringify({ idempotency_key: 'form:client-event-1' }),
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(retries, [{ idempotencyKey: 'form:client-event-1', nowEpochSeconds: 12 }]);
});

test('lead-admin handler returns follow-up retry conflicts without invoking worker', async () => {
  const handler = createLeadAdminHandler(
    makeDeps({
      retryFollowupWork: async () => ({
        ok: false,
        statusCode: 409,
        error: 'delivery_attempt_unconfirmed',
      }),
    }),
  );

  const result = await handler({
    requestContext: {
      http: { method: 'POST', path: '/admin/leads/followup-work/retry' },
    },
    headers: { authorization: authHeader('secret') },
    body: JSON.stringify({ idempotency_key: 'form:client-event-1' }),
  });

  assert.equal(result.statusCode, 409);
  assert.match(result.body, /delivery_attempt_unconfirmed/);
});

test('lead-admin handler manually resolves follow-up work', async () => {
  const resolutions: Array<{ idempotencyKey: string; reason: string; nowEpochSeconds: number }> =
    [];
  const handler = createLeadAdminHandler(
    makeDeps({
      resolveFollowupWorkManually: async (args) => {
        resolutions.push(args);
        return { ok: true };
      },
      nowEpochMs: () => 14_000,
    }),
  );

  const result = await handler({
    requestContext: {
      http: { method: 'POST', path: '/admin/leads/followup-work/manual' },
    },
    headers: { authorization: authHeader('secret') },
    body: JSON.stringify({
      idempotency_key: 'chat:cthr_123',
      reason: 'Victor handled this by phone.',
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(resolutions, [
    {
      idempotencyKey: 'chat:cthr_123',
      reason: 'Victor handled this by phone.',
      nowEpochSeconds: 14,
    },
  ]);
});
