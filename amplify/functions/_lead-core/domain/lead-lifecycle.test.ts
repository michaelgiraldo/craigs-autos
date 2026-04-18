import assert from 'node:assert/strict';
import test from 'node:test';
import {
  eventCreatesLeadRecord,
  eventRequiresExistingLeadRecord,
  getLeadLifecycleRule,
  isLeadInteractionEventName,
  isLeadPromotionEventName,
  LEAD_INTERACTION_EVENT_NAMES,
} from './lead-lifecycle.ts';
import type { JourneyEventName } from './journey-event.ts';

const allEventNames: JourneyEventName[] = [
  'lead_form_submit_success',
  'lead_form_submit_error',
  'lead_chat_first_message_sent',
  'lead_chat_handoff_completed',
  'lead_chat_handoff_blocked',
  'lead_chat_handoff_deferred',
  'lead_chat_handoff_error',
  'lead_click_to_call',
  'lead_click_to_text',
  'lead_click_email',
  'lead_click_directions',
  'lead_outreach_sms_sent',
  'lead_outreach_sms_failed',
  'lead_outreach_email_sent',
  'lead_outreach_email_failed',
  'lead_quo_contact_synced',
  'lead_quo_contact_sync_failed',
  'lead_record_qualified',
  'lead_record_unqualified',
];

test('every journey event has an explicit lifecycle rule', () => {
  for (const eventName of allEventNames) {
    assert.ok(getLeadLifecycleRule(eventName), eventName);
  }
});

test('interaction capture events stay journey-only and do not create lead records', () => {
  for (const eventName of LEAD_INTERACTION_EVENT_NAMES) {
    assert.equal(isLeadInteractionEventName(eventName), true);
    assert.equal(eventCreatesLeadRecord(eventName), false);
    assert.equal(eventRequiresExistingLeadRecord(eventName), false);
    assert.equal(getLeadLifecycleRule(eventName).phase, 'journey_interaction');
  }
});

test('only quote submit success and completed chat handoff promote journeys to leads', () => {
  const promotions = allEventNames.filter(isLeadPromotionEventName);

  assert.deepEqual(promotions, ['lead_form_submit_success', 'lead_chat_handoff_completed']);
  for (const eventName of promotions) {
    assert.equal(eventCreatesLeadRecord(eventName), true);
    assert.equal(eventRequiresExistingLeadRecord(eventName), false);
  }
});

test('outreach and qualification events require an existing lead record', () => {
  for (const eventName of allEventNames) {
    const rule = getLeadLifecycleRule(eventName);
    if (rule.phase === 'lead_workflow' || rule.phase === 'lead_verification') {
      if (
        eventName !== 'lead_chat_handoff_blocked' &&
        eventName !== 'lead_chat_handoff_deferred' &&
        eventName !== 'lead_chat_handoff_error'
      ) {
        assert.equal(rule.requiresExistingLeadRecord, true, eventName);
      }
    }
  }
});
