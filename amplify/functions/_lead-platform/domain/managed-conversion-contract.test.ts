import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateManagedConversionDestination,
  extractManagedConversionSignals,
  parseManagedConversionDestinations,
  summarizeManagedConversionFeedback,
} from '@craigs/contracts/managed-conversion-contract';

test('managed conversion destinations parse only known destination keys', () => {
  assert.deepEqual(parseManagedConversionDestinations('google_ads,unknown, meta_ads'), [
    'google_ads',
    'meta_ads',
  ]);
  assert.deepEqual(parseManagedConversionDestinations(['snap_ads', 'snap_ads', 'yelp_ads']), [
    'snap_ads',
    'yelp_ads',
  ]);
});

test('managed conversion signals cover major paid acquisition identifiers', () => {
  const signals = extractManagedConversionSignals({
    attribution: {
      gclid: 'gclid-1',
      msclkid: 'msclkid-1',
      fbclid: 'fbclid-1',
      ttclid: 'ttclid-1',
      li_fat_id: 'li-1',
      epik: 'epik-1',
      sc_click_id: 'snap-1',
      yelp_lead_id: 'yelp-1',
      fbp: 'fbp-1',
      ttp: 'ttp-1',
      scid: 'scid-1',
    },
    contact: {
      normalized_email: 'person@example.com',
      normalized_phone: '+14085550100',
    },
  });

  assert.deepEqual(Object.keys(signals.click_ids), [
    'gclid',
    'msclkid',
    'fbclid',
    'ttclid',
    'li_fat_id',
    'epik',
    'sc_click_id',
    'yelp_lead_id',
  ]);
  assert.deepEqual(Object.keys(signals.browser_ids), ['fbp', 'ttp', 'scid']);
  assert.equal(signals.has_email, true);
  assert.equal(signals.has_phone, true);
});

test('qualified lead with signal but no configured destination needs destination config', () => {
  const summary = summarizeManagedConversionFeedback({
    qualified: true,
    attribution: { gclid: 'gclid-1' },
    contact: { normalized_phone: '+14085550100' },
    configuredDestinationKeys: [],
  });

  assert.equal(summary.status, 'needs_destination_config');
  assert.deepEqual(summary.candidate_destination_keys, ['google_ads']);
  assert.deepEqual(summary.signal_keys, ['gclid', 'phone']);
});

test('configured destination becomes ready from click id or enhanced identity', () => {
  assert.deepEqual(
    evaluateManagedConversionDestination('microsoft_ads', {
      attribution: { msclkid: 'msclkid-1' },
      contact: null,
    }),
    {
      destination_key: 'microsoft_ads',
      destination_label: 'Microsoft Ads',
      eligible: true,
      reasons: ['click_id:msclkid'],
    },
  );

  const summary = summarizeManagedConversionFeedback({
    qualified: true,
    attribution: {},
    contact: { normalized_email: 'person@example.com' },
    configuredDestinationKeys: ['meta_ads'],
  });

  assert.equal(summary.status, 'ready');
  assert.deepEqual(summary.eligible_destination_keys, ['meta_ads']);
  assert.deepEqual(summary.signal_keys, ['email']);
});

test('unqualified or unsignaled leads are not ready for conversion feedback', () => {
  assert.equal(
    summarizeManagedConversionFeedback({
      qualified: false,
      attribution: { gclid: 'gclid-1' },
      contact: { normalized_phone: '+14085550100' },
      configuredDestinationKeys: ['google_ads'],
    }).status,
    'not_ready',
  );

  assert.equal(
    summarizeManagedConversionFeedback({
      qualified: true,
      attribution: {},
      contact: null,
      configuredDestinationKeys: ['google_ads'],
    }).status,
    'needs_signal',
  );
});
