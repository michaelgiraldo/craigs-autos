import assert from 'node:assert/strict';
import test from 'node:test';
import type { LeadRecord } from '../domain/lead-record.ts';
import { mergeLeadRecords } from './merge-lead-record.ts';

function makeLeadRecord(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    lead_record_id: 'lead-1',
    journey_id: 'journey-1',
    contact_id: 'contact-1',
    status: 'ready_for_outreach',
    capture_channel: 'form',
    title: 'Seat repair',
    vehicle: '1969 Camaro',
    service: 'seat-repair',
    project_summary: 'Driver seat tear',
    customer_message: 'Driver seat tear',
    customer_language: null,
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
      qualified: false,
      qualified_at_ms: null,
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

test('mergeLeadRecords keeps the strongest lifecycle status and outreach snapshot', () => {
  const merged = mergeLeadRecords(
    makeLeadRecord({ status: 'ready_for_outreach' }),
    makeLeadRecord({
      status: 'outreach_sent',
      latest_outreach: {
        channel: 'sms',
        status: 'sent',
        provider: 'quo',
        external_id: 'sms-1',
        error: null,
        sent_at_ms: 2_000,
      },
      updated_at_ms: 2_000,
    }),
  );

  assert.equal(merged.status, 'outreach_sent');
  assert.equal(merged.latest_outreach.status, 'sent');
  assert.equal(merged.latest_outreach.external_id, 'sms-1');
  assert.equal(merged.updated_at_ms, 2_000);
});

test('mergeLeadRecords preserves qualification and longer customer context', () => {
  const merged = mergeLeadRecords(
    makeLeadRecord({
      customer_message: 'Short note',
      qualification: {
        qualified: true,
        qualified_at_ms: 2_000,
      },
    }),
    makeLeadRecord({
      customer_message: 'Longer note with useful context',
      qualification: {
        qualified: false,
        qualified_at_ms: null,
      },
    }),
  );

  assert.equal(merged.customer_message, 'Longer note with useful context');
  assert.equal(merged.qualification.qualified, true);
  assert.equal(merged.qualification.qualified_at_ms, 2_000);
});
