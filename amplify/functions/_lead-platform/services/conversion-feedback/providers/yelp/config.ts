import type { ProviderExecutionMode } from '../../adapter-types.ts';
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
    .replace(/[^a-z0-9_-]/gu, '_');
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
