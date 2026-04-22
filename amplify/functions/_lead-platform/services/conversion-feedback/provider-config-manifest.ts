import { MANAGED_CONVERSION_PROVIDER_DEFINITIONS } from './provider-catalog.ts';

export const MANAGED_CONVERSION_PROVIDER_CONFIG_FIELDS = Object.freeze([
  ...MANAGED_CONVERSION_PROVIDER_DEFINITIONS.flatMap((definition) => definition.configFields),
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
