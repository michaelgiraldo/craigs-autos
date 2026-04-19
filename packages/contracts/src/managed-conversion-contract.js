export const MANAGED_CONVERSION_CONTRACT = 'craigs-managed-conversions-v1';

export const MANAGED_CONVERSION_DESTINATIONS = Object.freeze({
  google_ads: Object.freeze({
    key: 'google_ads',
    label: 'Google Ads',
    clickIdKeys: Object.freeze(['gclid', 'gbraid', 'wbraid']),
    browserIdKeys: Object.freeze([]),
    supportsEnhancedIdentity: true,
  }),
  microsoft_ads: Object.freeze({
    key: 'microsoft_ads',
    label: 'Microsoft Ads',
    clickIdKeys: Object.freeze(['msclkid']),
    browserIdKeys: Object.freeze([]),
    supportsEnhancedIdentity: true,
  }),
  meta_ads: Object.freeze({
    key: 'meta_ads',
    label: 'Meta Ads',
    clickIdKeys: Object.freeze(['fbclid']),
    browserIdKeys: Object.freeze(['fbc', 'fbp']),
    supportsEnhancedIdentity: true,
  }),
  tiktok_ads: Object.freeze({
    key: 'tiktok_ads',
    label: 'TikTok Ads',
    clickIdKeys: Object.freeze(['ttclid']),
    browserIdKeys: Object.freeze(['ttp']),
    supportsEnhancedIdentity: true,
  }),
  linkedin_ads: Object.freeze({
    key: 'linkedin_ads',
    label: 'LinkedIn Ads',
    clickIdKeys: Object.freeze(['li_fat_id']),
    browserIdKeys: Object.freeze([]),
    supportsEnhancedIdentity: true,
  }),
  pinterest_ads: Object.freeze({
    key: 'pinterest_ads',
    label: 'Pinterest Ads',
    clickIdKeys: Object.freeze(['epik']),
    browserIdKeys: Object.freeze([]),
    supportsEnhancedIdentity: true,
  }),
  snap_ads: Object.freeze({
    key: 'snap_ads',
    label: 'Snap Ads',
    clickIdKeys: Object.freeze(['sc_click_id']),
    browserIdKeys: Object.freeze(['scid', 'sc_cookie1']),
    supportsEnhancedIdentity: true,
  }),
  yelp_ads: Object.freeze({
    key: 'yelp_ads',
    label: 'Yelp Ads',
    clickIdKeys: Object.freeze(['yelp_lead_id']),
    browserIdKeys: Object.freeze([]),
    supportsEnhancedIdentity: true,
  }),
  manual_export: Object.freeze({
    key: 'manual_export',
    label: 'Manual Export',
    clickIdKeys: Object.freeze([]),
    browserIdKeys: Object.freeze([]),
    supportsEnhancedIdentity: true,
  }),
});

export const MANAGED_CONVERSION_DESTINATION_KEYS = Object.freeze(
  Object.keys(MANAGED_CONVERSION_DESTINATIONS),
);

export const MANAGED_CONVERSION_DECISION_TYPES = Object.freeze([
  'qualified_lead',
  'booked_job',
  'completed_job',
  'lost_lead',
  'spam',
  'not_a_fit',
]);

export const MANAGED_CONVERSION_FEEDBACK_STATUSES = Object.freeze([
  'not_ready',
  'needs_signal',
  'needs_destination_config',
  'ready',
  'queued',
  'manual',
  'sent',
  'accepted',
  'warning',
  'failed',
  'attributed',
  'suppressed',
  'retracted',
]);

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeSignalKey(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function readSignal(input, key) {
  if (!input || typeof input !== 'object') return null;

  const normalizedKey = normalizeSignalKey(key);
  const directValue = input[key] ?? input[normalizedKey];
  if (hasValue(directValue)) return directValue.trim();

  for (const containerKey of ['click_ids', 'browser_ids', 'provider_ids']) {
    const container = input[containerKey];
    if (!container || typeof container !== 'object') continue;
    const nestedValue = container[key] ?? container[normalizedKey];
    if (hasValue(nestedValue)) return nestedValue.trim();
  }

  return null;
}

function normalizeDestinationKey(value) {
  const normalized = normalizeSignalKey(value);
  return Object.hasOwn(MANAGED_CONVERSION_DESTINATIONS, normalized) ? normalized : null;
}

export function parseManagedConversionDestinations(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(normalizeDestinationKey).filter(Boolean))];
  }

  if (!hasValue(value)) return [];

  return [...new Set(value.split(',').map(normalizeDestinationKey).filter(Boolean))];
}

export function extractManagedConversionSignals(input = {}) {
  const attribution =
    input.attribution && typeof input.attribution === 'object' ? input.attribution : {};
  const contact = input.contact && typeof input.contact === 'object' ? input.contact : {};
  const clickIds = {};
  const browserIds = {};

  for (const destination of Object.values(MANAGED_CONVERSION_DESTINATIONS)) {
    for (const key of destination.clickIdKeys) {
      const value = readSignal(attribution, key);
      if (value) clickIds[key] = value;
    }

    for (const key of destination.browserIdKeys) {
      const value = readSignal(attribution, key);
      if (value) browserIds[key] = value;
    }
  }

  return {
    click_ids: clickIds,
    browser_ids: browserIds,
    has_email:
      hasValue(contact.normalized_email) || hasValue(contact.email) || hasValue(contact.raw_email),
    has_phone:
      hasValue(contact.normalized_phone) || hasValue(contact.phone) || hasValue(contact.raw_phone),
  };
}

export function evaluateManagedConversionDestination(destinationKey, input = {}) {
  const normalizedDestinationKey = normalizeDestinationKey(destinationKey);
  if (!normalizedDestinationKey) return null;

  const destination = MANAGED_CONVERSION_DESTINATIONS[normalizedDestinationKey];
  const signals = extractManagedConversionSignals(input);
  const clickIdKeys = destination.clickIdKeys.filter((key) => hasValue(signals.click_ids[key]));
  const browserIdKeys = destination.browserIdKeys.filter((key) =>
    hasValue(signals.browser_ids[key]),
  );
  const hasEnhancedIdentity =
    destination.supportsEnhancedIdentity && (signals.has_email || signals.has_phone);
  const eligible = Boolean(clickIdKeys.length || browserIdKeys.length || hasEnhancedIdentity);

  return {
    destination_key: normalizedDestinationKey,
    destination_label: destination.label,
    eligible,
    reasons: [
      ...clickIdKeys.map((key) => `click_id:${key}`),
      ...browserIdKeys.map((key) => `browser_id:${key}`),
      ...(hasEnhancedIdentity ? ['first_party_identity'] : []),
    ],
  };
}

export function summarizeManagedConversionFeedback(input = {}) {
  const qualified = input.qualified === true;
  const configuredDestinationKeys = parseManagedConversionDestinations(
    input.configuredDestinationKeys,
  );
  const signals = extractManagedConversionSignals(input);
  const clickedDestinationKeys = MANAGED_CONVERSION_DESTINATION_KEYS.filter((key) => {
    const destination = MANAGED_CONVERSION_DESTINATIONS[key];
    return (
      destination.clickIdKeys.some((clickKey) => hasValue(signals.click_ids[clickKey])) ||
      destination.browserIdKeys.some((browserKey) => hasValue(signals.browser_ids[browserKey]))
    );
  });
  const configuredEvaluations = configuredDestinationKeys
    .map((key) => evaluateManagedConversionDestination(key, input))
    .filter(Boolean);
  const eligibleEvaluations = configuredEvaluations.filter((evaluation) => evaluation.eligible);
  const signalKeys = [
    ...Object.keys(signals.click_ids),
    ...Object.keys(signals.browser_ids),
    ...(signals.has_email ? ['email'] : []),
    ...(signals.has_phone ? ['phone'] : []),
  ];

  if (!qualified) {
    return {
      contract: MANAGED_CONVERSION_CONTRACT,
      status: 'not_ready',
      status_label: 'Not ready',
      reason: 'Lead must be qualified before conversion feedback is evaluated.',
      configured_destination_keys: configuredDestinationKeys,
      eligible_destination_keys: [],
      candidate_destination_keys: clickedDestinationKeys,
      primary_destination_key: null,
      destination_labels: [],
      signal_keys: signalKeys,
    };
  }

  if (!signalKeys.length) {
    return {
      contract: MANAGED_CONVERSION_CONTRACT,
      status: 'needs_signal',
      status_label: 'Needs signal',
      reason: 'Qualified lead has no click, browser, email, or phone signal for provider matching.',
      configured_destination_keys: configuredDestinationKeys,
      eligible_destination_keys: [],
      candidate_destination_keys: [],
      primary_destination_key: null,
      destination_labels: [],
      signal_keys: [],
    };
  }

  if (!configuredDestinationKeys.length) {
    return {
      contract: MANAGED_CONVERSION_CONTRACT,
      status: 'needs_destination_config',
      status_label: 'Configure destination',
      reason:
        'Qualified lead has managed-conversion signals, but no feedback destination is configured.',
      configured_destination_keys: [],
      eligible_destination_keys: [],
      candidate_destination_keys: clickedDestinationKeys,
      primary_destination_key: null,
      destination_labels: clickedDestinationKeys.map(
        (key) => MANAGED_CONVERSION_DESTINATIONS[key].label,
      ),
      signal_keys: signalKeys,
    };
  }

  if (!eligibleEvaluations.length) {
    return {
      contract: MANAGED_CONVERSION_CONTRACT,
      status: 'needs_signal',
      status_label: 'Needs configured signal',
      reason: 'Qualified lead has signals, but none match the configured feedback destinations.',
      configured_destination_keys: configuredDestinationKeys,
      eligible_destination_keys: [],
      candidate_destination_keys: clickedDestinationKeys,
      primary_destination_key: null,
      destination_labels: [],
      signal_keys: signalKeys,
    };
  }

  return {
    contract: MANAGED_CONVERSION_CONTRACT,
    status: 'ready',
    status_label: 'Ready',
    reason:
      'Qualified lead has enough signal for at least one configured conversion feedback destination.',
    configured_destination_keys: configuredDestinationKeys,
    eligible_destination_keys: eligibleEvaluations.map((evaluation) => evaluation.destination_key),
    candidate_destination_keys: clickedDestinationKeys,
    primary_destination_key: eligibleEvaluations[0].destination_key,
    destination_labels: eligibleEvaluations.map((evaluation) => evaluation.destination_label),
    signal_keys: signalKeys,
  };
}
