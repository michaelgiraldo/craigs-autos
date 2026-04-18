import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEAD_BROWSER_SIGNAL_EVENT_NAMES,
  LEAD_DATA_LAYER_EVENT_NAMES,
  LEAD_EVENTS,
  LEAD_EVENT_DEFINITIONS,
  LEAD_EVENT_NAMES,
  buildLeadDataLayerEvent,
  getLeadEventDefinition,
  isLeadBrowserSignalEventName,
  isLeadDataLayerEventName,
} from '../../../../shared/lead-event-contract.js';
import { getLeadLifecycleRule } from './lead-lifecycle.ts';
import { getJourneyEventSemantics } from './lead-semantics.ts';
import type { JourneyEventName } from './journey-event.ts';

test('shared lead contract is the source of truth for backend semantics and lifecycle', () => {
  for (const eventName of LEAD_EVENT_NAMES) {
    const typedEventName = eventName as JourneyEventName;
    const definition = LEAD_EVENT_DEFINITIONS[typedEventName];
    const semantics = getJourneyEventSemantics(typedEventName);
    const lifecycle = getLeadLifecycleRule(typedEventName);

    assert.deepEqual(
      {
        eventClass: semantics.eventClass,
        customerAction: semantics.customerAction,
        captureChannel: semantics.captureChannel,
        journeyStatus: semantics.journeyStatus,
        leadStrength: semantics.leadStrength,
        verificationStatus: semantics.verificationStatus,
        workflowOutcome: semantics.workflowOutcome,
      },
      {
        eventClass: definition.eventClass,
        customerAction: definition.customerAction,
        captureChannel: definition.captureChannel,
        journeyStatus: definition.journeyStatus,
        leadStrength: definition.leadStrength,
        verificationStatus: definition.verificationStatus,
        workflowOutcome: definition.workflowOutcome,
      },
      eventName,
    );
    assert.deepEqual(
      lifecycle,
      {
        createsLeadRecord: definition.createsLeadRecord,
        phase: definition.lifecyclePhase,
        requiresExistingLeadRecord: definition.requiresExistingLeadRecord,
      },
      eventName,
    );
  }
});

test('public browser signal endpoint only accepts journey interaction events', () => {
  assert.deepEqual(LEAD_BROWSER_SIGNAL_EVENT_NAMES, [
    LEAD_EVENTS.chatFirstMessageSent,
    LEAD_EVENTS.clickToCall,
    LEAD_EVENTS.clickToText,
    LEAD_EVENTS.clickEmail,
    LEAD_EVENTS.clickDirections,
  ]);

  for (const eventName of LEAD_EVENT_NAMES) {
    const definition = getLeadEventDefinition(eventName);
    assert.equal(isLeadBrowserSignalEventName(eventName), definition?.browserSignal ?? false);
  }
});

test('dataLayer events are canonical and cannot override contract semantics', () => {
  assert.ok(LEAD_DATA_LAYER_EVENT_NAMES.includes(LEAD_EVENTS.formSubmitSuccess));
  assert.ok(LEAD_DATA_LAYER_EVENT_NAMES.includes(LEAD_EVENTS.chatHandoffCompleted));
  assert.ok(
    !(LEAD_DATA_LAYER_EVENT_NAMES as readonly string[]).includes(LEAD_EVENTS.outreachSmsSent),
  );

  const payload = buildLeadDataLayerEvent(LEAD_EVENTS.clickToCall, {
    event_class: 'diagnostic',
    customer_action: 'click_text',
    lead_strength: 'captured_lead',
    page_path: '/en/contact/',
  });

  assert.deepEqual(
    {
      event: payload?.event,
      event_class: payload?.event_class,
      customer_action: payload?.customer_action,
      lead_strength: payload?.lead_strength,
      verification_status: payload?.verification_status,
      page_path: payload?.page_path,
    },
    {
      event: LEAD_EVENTS.clickToCall,
      event_class: 'customer_action',
      customer_action: 'click_call',
      lead_strength: 'soft_intent',
      verification_status: 'unverified',
      page_path: '/en/contact/',
    },
  );

  assert.equal(isLeadDataLayerEventName(LEAD_EVENTS.outreachSmsSent), false);
  assert.equal(buildLeadDataLayerEvent(LEAD_EVENTS.outreachSmsSent), null);
});
