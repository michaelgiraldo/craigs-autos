import assert from 'node:assert/strict';
import test from 'node:test';
import { createLeadSignalHandler } from './handler.ts';
import type { Journey, JourneyEvent } from '../_lead-core/domain/types.ts';

test('lead-signal handler rejects invalid events', async () => {
  const handler = createLeadSignalHandler({
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
      pageUrl: 'https://cesar.autos/en/',
    }),
  });

  assert.equal(result.statusCode, 400);
  assert.match(result.body, /Invalid event/);
});

test('lead-signal handler writes a journey event for valid payload', async () => {
  const journeys: Journey[] = [];
  const events: JourneyEvent[] = [];
  const handler = createLeadSignalHandler({
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
      event: 'lead_click_to_call',
      pageUrl: 'https://cesar.autos/en/contact/?gclid=test-gclid',
      user: 'anon_123',
      locale: 'en',
      clickUrl: 'tel:+14083793820',
      provider: null,
      attribution: {
        utm_source: 'google',
      },
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(events.length, 1);
  assert.equal(journeys.length, 1);
  assert.equal(events[0]?.event_name, 'lead_click_to_call');
  assert.equal(events[0]?.customer_action, 'click_call');
  assert.equal(events[0]?.lead_strength, 'soft_intent');
  assert.equal(journeys[0]?.first_action, 'click_call');
});

test('lead-signal handler returns 500 when configuration is missing', async () => {
  const handler = createLeadSignalHandler({
    configValid: false,
    nowEpochMs: () => 1_000,
    getJourney: async () => null,
    getEvent: async () => null,
    putJourney: async () => undefined,
    putEvent: async () => undefined,
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({ event: 'lead_click_to_call' }),
  });

  assert.equal(result.statusCode, 500);
});
