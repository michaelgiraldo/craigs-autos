import assert from 'node:assert/strict';
import test from 'node:test';
import { LEAD_EVENTS, LEAD_EVENT_NAMES } from '../../../../shared/lead-event-contract.js';
import {
  eventCreatesLeadRecord,
  eventRequiresExistingLeadRecord,
  getLeadLifecycleRule,
  isLeadInteractionEventName,
  isLeadPromotionEventName,
  LEAD_INTERACTION_EVENT_NAMES,
} from './lead-lifecycle.ts';
import type { JourneyEventName } from './journey-event.ts';

const allEventNames = [...LEAD_EVENT_NAMES] as JourneyEventName[];

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

  assert.deepEqual(promotions, [LEAD_EVENTS.formSubmitSuccess, LEAD_EVENTS.chatHandoffCompleted]);
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
        eventName !== LEAD_EVENTS.chatHandoffBlocked &&
        eventName !== LEAD_EVENTS.chatHandoffDeferred &&
        eventName !== LEAD_EVENTS.chatHandoffError
      ) {
        assert.equal(rule.requiresExistingLeadRecord, true, eventName);
      }
    }
  }
});
