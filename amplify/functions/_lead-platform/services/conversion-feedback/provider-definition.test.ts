import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderExecutionMode } from './adapter-types.ts';
import {
  MANAGED_CONVERSION_PROVIDER_DEFINITIONS,
  createManagedConversionProviderCatalog,
} from './provider-catalog.ts';
import {
  MANAGED_CONVERSION_PROVIDER_CONFIG_FIELDS,
  MANAGED_CONVERSION_PROVIDER_ENV_DEFAULTS,
  MANAGED_CONVERSION_PROVIDER_ENV_KEYS,
} from './provider-config-manifest.ts';
import {
  createAdapterFromProviderDefinition,
  defineManagedConversionProvider,
} from './provider-definition.ts';

test('managed conversion provider definitions have unique keys and config fields', () => {
  const providerKeys = MANAGED_CONVERSION_PROVIDER_DEFINITIONS.map((definition) => definition.key);
  assert.equal(new Set(providerKeys).size, providerKeys.length);

  for (const definition of MANAGED_CONVERSION_PROVIDER_DEFINITIONS) {
    assert.ok(definition.label);
    assert.ok(definition.modes.length > 0);
  }

  const envKeys = MANAGED_CONVERSION_PROVIDER_CONFIG_FIELDS.map((field) => field.envKey);
  assert.equal(new Set(envKeys).size, envKeys.length);

  for (const field of MANAGED_CONVERSION_PROVIDER_CONFIG_FIELDS) {
    assert.ok(field.name);
    assert.ok(field.envKey);
    assert.ok(field.providerConfigKey);
    assert.ok(field.description);
    assert.equal(typeof MANAGED_CONVERSION_PROVIDER_ENV_DEFAULTS[field.envKey], 'string');
  }

  assert.deepEqual([...MANAGED_CONVERSION_PROVIDER_ENV_KEYS].sort(), [...envKeys].sort());
});

test('managed conversion provider catalog looks up providers by exact destination key', () => {
  const catalog = createManagedConversionProviderCatalog();
  const providerKeys = MANAGED_CONVERSION_PROVIDER_DEFINITIONS.map((definition) => definition.key);

  for (const providerKey of providerKeys) {
    assert.equal(catalog.getAdapter(providerKey)?.key, providerKey);
  }
});

test('managed conversion provider catalog rejects duplicate destination keys', () => {
  assert.throws(
    () =>
      createManagedConversionProviderCatalog({
        definitions: [
          MANAGED_CONVERSION_PROVIDER_DEFINITIONS[0],
          MANAGED_CONVERSION_PROVIDER_DEFINITIONS[0],
        ],
      }),
    /Duplicate managed conversion provider key/,
  );
});

test('createAdapterFromProviderDefinition centralizes disabled, dry-run, and config behavior', async () => {
  let delivered = false;
  const definition = defineManagedConversionProvider<
    { mode: ProviderExecutionMode; missingDeliveryKeys: string[] },
    { example: string }
  >({
    key: 'google_ads',
    label: 'Example Provider',
    modes: ['disabled', 'dry_run', 'test', 'live'],
    configFields: [],
    parseConfig(_env, providerConfig) {
      return {
        mode: (providerConfig.mode as ProviderExecutionMode | undefined) ?? 'dry_run',
        missingDeliveryKeys: providerConfig.missing_live_config ? ['EXAMPLE_API_KEY'] : [],
      };
    },
    getMode: (config) => config.mode,
    buildPayload() {
      return {
        ok: true,
        request: { example: 'payload' },
        signalKeys: ['email'],
        warnings: ['example warning'],
      };
    },
    getMissingDeliveryConfigKeys: (config) => config.missingDeliveryKeys,
    async deliver() {
      delivered = true;
      return {
        status: 'accepted',
        message: 'Accepted.',
      };
    },
  });

  const adapter = createAdapterFromProviderDefinition(definition, { env: {} });
  const baseContext = {
    destination: {
      destination_key: 'google_ads',
      provider_config: {},
    },
  };

  const disabled = await adapter.deliver({
    ...baseContext,
    destination: {
      destination_key: 'google_ads',
      provider_config: { mode: 'disabled' },
    },
  } as never);
  assert.equal(disabled.status, 'needs_destination_config');
  assert.equal(disabled.errorCode, 'google_ads_disabled');

  const dryRun = await adapter.deliver(baseContext as never);
  assert.equal(dryRun.status, 'validated');
  assert.equal(dryRun.payload?.mode, 'dry_run');
  assert.deepEqual(dryRun.payload?.signal_keys, ['email']);
  assert.deepEqual(dryRun.payload?.warnings, ['example warning']);
  assert.deepEqual(dryRun.payload?.request, { example: 'payload' });

  const missingLiveConfig = await adapter.deliver({
    ...baseContext,
    destination: {
      destination_key: 'google_ads',
      provider_config: { mode: 'live', missing_live_config: true },
    },
  } as never);
  assert.equal(missingLiveConfig.status, 'needs_destination_config');
  assert.equal(missingLiveConfig.errorCode, 'google_ads_missing_live_config');
  assert.deepEqual(missingLiveConfig.payload?.missing_config_keys, ['EXAMPLE_API_KEY']);
  assert.equal(delivered, false);

  const live = await adapter.deliver({
    ...baseContext,
    destination: {
      destination_key: 'google_ads',
      provider_config: { mode: 'live' },
    },
  } as never);
  assert.equal(live.status, 'accepted');
  assert.equal(delivered, true);
});
