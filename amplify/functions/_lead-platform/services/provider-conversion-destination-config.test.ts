import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MANAGED_CONVERSION_DESTINATION_CONFIG_VERSION,
  buildProviderConversionDestinationFromConfig,
  evaluateManagedConversionDestinationConfigReadiness,
  parseManagedConversionDestinationConfig,
} from './provider-conversion-destination-config.ts';

function parseValidConfig(input: unknown) {
  const result = parseManagedConversionDestinationConfig(input);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('expected config to parse');
  return result.config;
}

test('parseManagedConversionDestinationConfig accepts config-as-code destination state', () => {
  const config = parseValidConfig({
    version: MANAGED_CONVERSION_DESTINATION_CONFIG_VERSION,
    destinations: [
      {
        destination_key: 'manual_export',
        enabled: true,
        provider_config: {},
      },
      {
        destination_key: 'google_ads',
        enabled: false,
        provider_config: {
          mode: 'dry_run',
          currency_code: 'USD',
          account_default_consent_configured: true,
        },
      },
    ],
  });

  assert.deepEqual(
    config.destinations.map((destination) => ({
      key: destination.destination_key,
      enabled: destination.enabled,
      deliveryMode: destination.delivery_mode,
      source: destination.config_source,
    })),
    [
      {
        key: 'manual_export',
        enabled: true,
        deliveryMode: 'manual',
        source: 'config_file',
      },
      {
        key: 'google_ads',
        enabled: false,
        deliveryMode: 'provider_api',
        source: 'config_file',
      },
    ],
  );
});

test('parseManagedConversionDestinationConfig rejects duplicates, unknown fields, and checked-in secrets', () => {
  const result = parseManagedConversionDestinationConfig({
    version: MANAGED_CONVERSION_DESTINATION_CONFIG_VERSION,
    destinations: [
      {
        destination_key: 'google_ads',
        enabled: true,
        provider_config: {
          access_token: 'do-not-commit',
        },
      },
      {
        destination_key: 'google_ads',
        enabled: false,
        provider_config: {},
      },
      {
        destination_key: 'yelp_ads',
        enabled: true,
        provider_config: {
          typo: 'value',
        },
      },
    ],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.errors, [
    'google_ads.provider_config.access_token is a secret-backed field and must be configured through environment/secrets, not checked-in config.',
    'google_ads is duplicated in destinations.',
    'yelp_ads.provider_config.typo is not recognized.',
  ]);
});

test('buildProviderConversionDestinationFromConfig creates durable destination records', () => {
  const config = parseValidConfig({
    version: MANAGED_CONVERSION_DESTINATION_CONFIG_VERSION,
    destinations: [
      {
        destination_key: 'yelp_ads',
        enabled: true,
        provider_config: {
          mode: 'dry_run',
        },
      },
    ],
  });

  const destination = buildProviderConversionDestinationFromConfig({
    entry: config.destinations[0],
    nowMs: 2_000,
    existing: {
      destination_key: 'yelp_ads',
      destination_label: 'Yelp Ads',
      enabled: false,
      delivery_mode: 'provider_api',
      config_source: 'environment',
      provider_config: {},
      created_at_ms: 1_000,
      updated_at_ms: 1_000,
    },
  });

  assert.deepEqual(destination, {
    destination_key: 'yelp_ads',
    destination_label: 'Yelp Ads',
    enabled: true,
    delivery_mode: 'provider_api',
    config_source: 'config_file',
    provider_config: { mode: 'dry_run' },
    created_at_ms: 1_000,
    updated_at_ms: 2_000,
  });
});

test('evaluateManagedConversionDestinationConfigReadiness reports disabled, ready, and missing config states', () => {
  const config = parseValidConfig({
    version: MANAGED_CONVERSION_DESTINATION_CONFIG_VERSION,
    destinations: [
      {
        destination_key: 'manual_export',
        enabled: true,
        provider_config: {},
      },
      {
        destination_key: 'google_ads',
        enabled: true,
        provider_config: {
          mode: 'dry_run',
        },
      },
      {
        destination_key: 'yelp_ads',
        enabled: false,
        provider_config: {
          mode: 'dry_run',
        },
      },
    ],
  });

  const readiness = evaluateManagedConversionDestinationConfigReadiness({ config, env: {} });

  assert.deepEqual(
    readiness.map((item) => ({
      key: item.destination_key,
      status: item.status,
      mode: item.mode,
      missing: item.missing_config_keys,
    })),
    [
      {
        key: 'manual_export',
        status: 'ready',
        mode: 'manual',
        missing: [],
      },
      {
        key: 'google_ads',
        status: 'needs_destination_config',
        mode: 'dry_run',
        missing: [
          'GOOGLE_ADS_CUSTOMER_ID',
          'GOOGLE_ADS_CONVERSION_ACTION_RESOURCE_NAME or GOOGLE_ADS_CONVERSION_ACTION_ID',
          'GOOGLE_ADS_AD_USER_DATA_CONSENT or GOOGLE_ADS_ACCOUNT_DEFAULT_CONSENT_CONFIGURED',
        ],
      },
      {
        key: 'yelp_ads',
        status: 'disabled',
        mode: null,
        missing: [],
      },
    ],
  );
});
