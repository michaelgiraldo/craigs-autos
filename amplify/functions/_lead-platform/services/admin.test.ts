import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  LeadConversionDecision,
  LeadConversionFeedbackOutboxItem,
  LeadConversionFeedbackOutcome,
} from '../domain/conversion-feedback.ts';
import type { LeadContact } from '../domain/contact.ts';
import {
  createLeadFollowupWorkItem,
  type LeadFollowupWorkItem,
} from '../domain/lead-followup-work.ts';
import type { LeadRecord } from '../domain/lead-record.ts';
import {
  getLeadFollowupRetryBlockReason,
  toLeadAdminFollowupWorkSummary,
  toLeadAdminRecordSummary,
} from './admin.ts';

function makeLeadRecord(): LeadRecord {
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
  };
}

function makeContact(): LeadContact {
  return {
    contact_id: 'contact-1',
    normalized_phone: '+14085550100',
    normalized_email: 'alex@example.com',
    first_name: 'Alex',
    last_name: 'Customer',
    display_name: 'Alex Customer',
    raw_phone: '(408) 555-0100',
    raw_email: 'alex@example.com',
    quo_contact_id: null,
    quo_tags: [],
    created_at_ms: 1_000,
    updated_at_ms: 1_000,
  };
}

function makeFollowupWork(overrides: Partial<LeadFollowupWorkItem> = {}): LeadFollowupWorkItem {
  return {
    ...createLeadFollowupWorkItem({
      attribution: null,
      captureChannel: 'form',
      email: 'alex@example.com',
      followupWorkId: 'form_abc',
      idempotencyKey: 'form:abc',
      locale: 'en',
      message: 'Seat tear',
      name: 'Alex',
      nowEpochSeconds: 1_000,
      origin: 'form:submit',
      pageUrl: 'https://craigs.autos/en/request-a-quote',
      phone: '+14085550100',
      service: 'seat repair',
      siteLabel: 'craigs.autos',
      sourceEventId: 'abc',
      userId: 'anon-user',
      vehicle: '1969 Camaro',
    }),
    ...overrides,
  };
}

test('toLeadAdminRecordSummary exposes conversion decisions, outbox state, and latest outcomes', () => {
  const decision: LeadConversionDecision = {
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
    occurred_at_ms: 2_000,
    created_at_ms: 2_000,
    updated_at_ms: 2_000,
  };
  const outboxItem: LeadConversionFeedbackOutboxItem = {
    outbox_id: 'outbox-1',
    decision_id: 'decision-1',
    lead_record_id: 'lead-1',
    journey_id: 'journey-1',
    destination_key: 'manual_export',
    destination_label: 'Manual Export',
    status: 'manual',
    status_reason: 'Ready for manual export.',
    signal_keys: ['email'],
    dedupe_key: 'decision-1:manual_export',
    payload_contract: 'craigs-managed-conversions-v1',
    attempt_count: 1,
    lease_owner: null,
    lease_expires_at_ms: null,
    next_attempt_at_ms: null,
    last_outcome_at_ms: 3_000,
    created_at_ms: 2_000,
    updated_at_ms: 3_000,
  };
  const outcomes: LeadConversionFeedbackOutcome[] = [
    {
      outbox_id: 'outbox-1',
      outcome_sort_key: '0000000000002500#old',
      outcome_id: 'old',
      decision_id: 'decision-1',
      lead_record_id: 'lead-1',
      journey_id: 'journey-1',
      destination_key: 'manual_export',
      destination_label: 'Manual Export',
      status: 'queued',
      message: 'Queued.',
      provider_response_id: null,
      error_code: null,
      diagnostics_url: null,
      occurred_at_ms: 2_500,
      recorded_at_ms: 2_500,
      payload: {},
    },
    {
      outbox_id: 'outbox-1',
      outcome_sort_key: '0000000000003000#new',
      outcome_id: 'new',
      decision_id: 'decision-1',
      lead_record_id: 'lead-1',
      journey_id: 'journey-1',
      destination_key: 'manual_export',
      destination_label: 'Manual Export',
      status: 'manual',
      message: 'No provider API was called.',
      provider_response_id: null,
      error_code: null,
      diagnostics_url: null,
      occurred_at_ms: 3_000,
      recorded_at_ms: 3_000,
      payload: {},
    },
  ];

  const summary = toLeadAdminRecordSummary({
    leadRecord: makeLeadRecord(),
    contact: makeContact(),
    configuredConversionDestinations: ['manual_export'],
    conversionDecisions: [decision],
    conversionFeedbackOutboxItems: [outboxItem],
    conversionFeedbackOutcomes: outcomes,
  });

  assert.equal(summary.conversion_feedback.status, 'manual');
  assert.equal(summary.conversion_feedback_detail.decisions[0].decision_id, 'decision-1');
  assert.equal(summary.conversion_feedback_detail.outbox_items[0].outbox_id, 'outbox-1');
  assert.equal(
    summary.conversion_feedback_detail.outbox_items[0].latest_outcome?.outcome_id,
    'new',
  );
  assert.deepEqual(
    summary.conversion_feedback_detail.outcomes.map((outcome) => outcome.outcome_id),
    ['new', 'old'],
  );
});

test('toLeadAdminFollowupWorkSummary exposes actionable failed follow-up work', () => {
  const summary = toLeadAdminFollowupWorkSummary({
    nowEpochSeconds: 2_000,
    record: makeFollowupWork({
      status: 'error',
      updated_at: 1_100,
      sms_status: 'failed',
      sms_error: 'QUO unavailable',
      lead_record_id: 'lead-1',
    }),
  });

  assert.equal(summary.status, 'error');
  assert.equal(summary.error, 'QUO unavailable');
  assert.equal(summary.stale, true);
  assert.equal(summary.retry_allowed, true);
  assert.equal(summary.manual_resolution_allowed, true);
});

test('getLeadFollowupRetryBlockReason blocks unconfirmed delivery attempts', () => {
  assert.equal(
    getLeadFollowupRetryBlockReason({
      nowEpochSeconds: 2_000,
      record: makeFollowupWork({
        status: 'error',
        sms_status: 'sending',
        owner_email_error: 'delivery_attempt_unconfirmed',
      }),
    }),
    'delivery_attempt_unconfirmed',
  );
});
