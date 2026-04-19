import type { ProviderExecutionMode } from '../../adapter-types.ts';
import type { ProviderConfigField } from '../../provider-definition.ts';
import {
  normalizeCurrencyCode,
  parseProviderExecutionMode,
  readConfigValue,
  readStringConfigValue,
  trimToNull,
  type ProviderRawConfig,
} from '../../config.ts';

export type YelpActionSource = 'app' | 'physical_store' | 'website';
export type YelpEventName = 'lead' | 'purchase' | `custom_${string}`;

export const YELP_CONFIG_FIELDS = Object.freeze([
  {
    name: 'mode',
    envKey: 'YELP_CONVERSION_FEEDBACK_MODE',
    providerConfigKey: 'mode',
    defaultValue: 'dry_run',
    description: 'Yelp delivery mode: disabled, dry_run, test/test_event, or live.',
  },
  {
    name: 'endpointBase',
    envKey: 'YELP_CONVERSION_ENDPOINT_BASE',
    providerConfigKey: 'endpoint_base',
    defaultValue: 'https://api.yelp.com',
    description: 'Yelp API endpoint base URL.',
  },
  {
    name: 'apiKey',
    envKey: 'YELP_CONVERSION_API_KEY',
    providerConfigKey: 'api_key',
    secret: true,
    requiredForModes: ['test', 'live'],
    description: 'Yelp Conversions API bearer token.',
  },
  {
    name: 'defaultEventName',
    envKey: 'YELP_CONVERSION_DEFAULT_EVENT_NAME',
    providerConfigKey: 'default_event_name',
    defaultValue: 'lead',
    description: 'Default Yelp conversion event name for qualified leads.',
  },
  {
    name: 'actionSource',
    envKey: 'YELP_CONVERSION_ACTION_SOURCE',
    providerConfigKey: 'action_source',
    defaultValue: 'website',
    description: 'Yelp action source: app, physical_store, or website.',
  },
  {
    name: 'currencyCode',
    envKey: 'YELP_CONVERSION_CURRENCY_CODE',
    providerConfigKey: 'currency_code',
    defaultValue: 'USD',
    description: 'Yelp purchase currency code. Yelp currently accepts USD or CAD.',
  },
] satisfies ProviderConfigField[]);

export type YelpManagedConversionConfig = {
  mode: ProviderExecutionMode;
  endpointBase: string;
  apiKey: string | null;
  defaultEventName: YelpEventName;
  actionSource: YelpActionSource;
  currencyCode: 'USD' | 'CAD' | null;
};

function normalizeActionSource(value: unknown): YelpActionSource {
  const normalized = trimToNull(value)?.toLowerCase();
  return normalized === 'app' || normalized === 'physical_store' || normalized === 'website'
    ? normalized
    : 'website';
}

function normalizeEventName(value: unknown): YelpEventName {
  const normalized = trimToNull(value)
    ?.toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  if (normalized === 'lead' || normalized === 'purchase') return normalized;
  if (normalized?.startsWith('custom_') && normalized.length <= 50) {
    return normalized as YelpEventName;
  }
  return 'lead';
}

function normalizeYelpCurrency(value: unknown): 'USD' | 'CAD' | null {
  const normalized = normalizeCurrencyCode(value);
  return normalized === 'USD' || normalized === 'CAD' ? normalized : null;
}

export function parseYelpManagedConversionConfig(
  env: Record<string, string | undefined>,
  providerConfig: ProviderRawConfig = {},
): YelpManagedConversionConfig {
  const modeValue =
    providerConfig.mode ?? env.YELP_CONVERSION_FEEDBACK_MODE ?? env.YELP_MODE ?? 'dry_run';

  return {
    mode: parseProviderExecutionMode(modeValue),
    endpointBase:
      readStringConfigValue(
        env,
        providerConfig,
        'YELP_CONVERSION_ENDPOINT_BASE',
        'endpoint_base',
      ) ?? 'https://api.yelp.com',
    apiKey: readStringConfigValue(env, providerConfig, 'YELP_CONVERSION_API_KEY', 'api_key'),
    defaultEventName: normalizeEventName(
      readConfigValue(
        env,
        providerConfig,
        'YELP_CONVERSION_DEFAULT_EVENT_NAME',
        'default_event_name',
      ),
    ),
    actionSource: normalizeActionSource(
      readConfigValue(env, providerConfig, 'YELP_CONVERSION_ACTION_SOURCE', 'action_source'),
    ),
    currencyCode: normalizeYelpCurrency(
      readConfigValue(env, providerConfig, 'YELP_CONVERSION_CURRENCY_CODE', 'currency_code'),
    ),
  };
}

export function getYelpMissingLiveConfigKeys(config: YelpManagedConversionConfig): string[] {
  return [config.apiKey ? null : 'YELP_CONVERSION_API_KEY'].filter((value): value is string =>
    Boolean(value),
  );
}
