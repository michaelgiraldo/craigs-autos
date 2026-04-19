import assert from 'node:assert/strict';
import test from 'node:test';
import type { Journey } from '../domain/journey.ts';
import { mergeJourneys } from './merge-journey.ts';

function makeJourney(overrides: Partial<Journey> = {}): Journey {
  return {
    journey_id: 'journey-1',
    lead_record_id: 'lead-1',
    contact_id: 'contact-1',
    journey_status: 'captured',
    status_reason: null,
    capture_channel: 'form',
    first_action: 'form_submit',
    latest_action: 'form_submit',
    action_types: ['form_submit'],
    action_count: 1,
    lead_user_id: 'anon-1',
    thread_id: null,
    locale: 'en',
    page_url: 'https://craigs.autos/en/request-a-quote',
    page_path: '/en/request-a-quote',
    origin: 'https://craigs.autos',
    site_label: 'craigs.autos',
    attribution: null,
    created_at_ms: 1_000,
    updated_at_ms: 1_000,
    ...overrides,
  };
}

test('mergeJourneys keeps captured state when later diagnostic workflow is weaker', () => {
  const merged = mergeJourneys(
    makeJourney({ journey_status: 'captured', status_reason: null }),
    makeJourney({
      journey_status: 'incomplete',
      status_reason: 'missing_contact',
      latest_action: null,
      action_types: [],
      action_count: 0,
      updated_at_ms: 2_000,
    }),
  );

  assert.equal(merged.journey_status, 'captured');
  assert.equal(merged.status_reason, null);
  assert.equal(merged.updated_at_ms, 2_000);
});

test('mergeJourneys dedupes action types while preserving first and latest actions', () => {
  const merged = mergeJourneys(
    makeJourney({
      first_action: 'click_call',
      latest_action: 'click_call',
      action_types: ['click_call'],
    }),
    makeJourney({
      first_action: 'form_submit',
      latest_action: 'form_submit',
      action_types: ['click_call', 'form_submit'],
      action_count: 2,
    }),
  );

  assert.equal(merged.first_action, 'click_call');
  assert.equal(merged.latest_action, 'form_submit');
  assert.deepEqual(merged.action_types, ['click_call', 'form_submit']);
  assert.equal(merged.action_count, 2);
});
