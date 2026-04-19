import assert from 'node:assert/strict';
import test from 'node:test';
import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';
import { createLeadInteractionCaptureHandler } from './handler.ts';
import type { Journey } from '../_lead-platform/domain/journey.ts';
import type { JourneyEvent } from '../_lead-platform/domain/journey-event.ts';

test('lead-interaction-capture handler rejects invalid events', async () => {
  const handler = createLeadInteractionCaptureHandler({
    configValid: true,
    nowEpochMs: () => 1_000,
    getJourney: async () => null,
    getEvent: async () => null,
    putJourney: async () => undefined,
    putEvent: async () => undefined,
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({
      event: 'not_a_real_event',
      pageUrl: 'https://example.test/en/',
    }),
  });

  assert.equal(result.statusCode, 400);
  assert.match(result.body, /Invalid event/);
});

test('lead-interaction-capture handler writes a journey event for valid payload', async () => {
  const journeys: Journey[] = [];
  const events: JourneyEvent[] = [];
  const handler = createLeadInteractionCaptureHandler({
    configValid: true,
    nowEpochMs: () => 1_000,
    getJourney: async () => null,
    getEvent: async () => null,
    putJourney: async (journey) => {
      journeys.push(journey);
    },
    putEvent: async (event) => {
      events.push(event);
    },
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({
      event: LEAD_EVENTS.clickToCall,
      pageUrl: 'https://example.test/en/contact/?gclid=test-gclid',
      user: 'anon_123',
      locale: 'en',
      clickUrl: 'tel:+14085550100',
      provider: null,
      attribution: {
        utm_source: 'google',
      },
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(events.length, 1);
  assert.equal(journeys.length, 1);
  assert.equal(events[0]?.event_name, LEAD_EVENTS.clickToCall);
  assert.equal(events[0]?.customer_action, 'click_call');
  assert.equal(events[0]?.lead_strength, 'soft_intent');
  assert.equal(journeys[0]?.first_action, 'click_call');
  assert.equal(journeys[0]?.lead_record_id, null);
  assert.equal(journeys[0]?.contact_id, null);
});

test('lead-interaction-capture handler dedupes retried browser events by client event id', async () => {
  const events = new Map<string, JourneyEvent>();
  const journeys: Journey[] = [];
  const handler = createLeadInteractionCaptureHandler({
    configValid: true,
    nowEpochMs: () => 1_000,
    getJourney: async () => journeys[journeys.length - 1] ?? null,
    getEvent: async (_journeyId, eventSortKey) => events.get(eventSortKey) ?? null,
    putJourney: async (journey) => {
      journeys.push(journey);
    },
    putEvent: async (event) => {
      events.set(event.event_sort_key, event);
    },
  });

  const payload = {
    event: LEAD_EVENTS.clickToText,
    journey_id: 'journey-shared',
    client_event_id: 'client-event-1',
    occurred_at_ms: 900,
    pageUrl: 'https://example.test/en/contact/',
    clickUrl: 'sms:+14085550101',
  };

  const first = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify(payload),
  });
  const retry = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({
      ...payload,
      occurred_at_ms: 1_050,
    }),
  });

  assert.equal(first.statusCode, 200);
  assert.match(first.body, /"recorded":true/);
  assert.equal(retry.statusCode, 200);
  assert.match(retry.body, /"recorded":false/);
  assert.equal(events.size, 1);
  assert.equal(journeys.length, 2);
  assert.equal(journeys[journeys.length - 1]?.lead_record_id, null);
});

test('lead-interaction-capture handler returns 500 when configuration is missing', async () => {
  const handler = createLeadInteractionCaptureHandler({
    configValid: false,
    nowEpochMs: () => 1_000,
    getJourney: async () => null,
    getEvent: async () => null,
    putJourney: async () => undefined,
    putEvent: async () => undefined,
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({ event: LEAD_EVENTS.clickToCall }),
  });

  assert.equal(result.statusCode, 500);
});
