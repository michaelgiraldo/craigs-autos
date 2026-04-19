import { GOOGLE_ADS_CONFIG_FIELDS } from './providers/google-ads/config.ts';
import { YELP_CONFIG_FIELDS } from './providers/yelp/config.ts';

export const MANAGED_CONVERSION_PROVIDER_CONFIG_FIELDS = Object.freeze([
  ...GOOGLE_ADS_CONFIG_FIELDS,
  ...YELP_CONFIG_FIELDS,
]);

export const MANAGED_CONVERSION_PROVIDER_ENV_KEYS = Object.freeze(
  Array.from(new Set(MANAGED_CONVERSION_PROVIDER_CONFIG_FIELDS.map((field) => field.envKey))),
);

export const MANAGED_CONVERSION_PROVIDER_ENV_DEFAULTS = Object.freeze(
  Object.fromEntries(
    MANAGED_CONVERSION_PROVIDER_CONFIG_FIELDS.map((field) => [
      field.envKey,
      field.defaultValue ?? '',
    ]),
  ) as Record<string, string>,
);
