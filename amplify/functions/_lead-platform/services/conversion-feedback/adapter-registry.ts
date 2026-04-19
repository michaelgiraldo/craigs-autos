import type { ManagedConversionFeedbackAdapter } from './adapter-types.ts';
import type { ProviderHttpClient } from './provider-http.ts';
import {
  createGoogleAdsManagedConversionAdapter,
  googleAdsProviderDefinition,
} from './providers/google-ads/index.ts';
import { createManualConversionFeedbackAdapter } from './providers/manual/adapter.ts';
import {
  createYelpManagedConversionAdapter,
  yelpProviderDefinition,
} from './providers/yelp/index.ts';
export {
  MANAGED_CONVERSION_PROVIDER_CONFIG_FIELDS,
  MANAGED_CONVERSION_PROVIDER_ENV_DEFAULTS,
  MANAGED_CONVERSION_PROVIDER_ENV_KEYS,
} from './provider-config-manifest.ts';

export const MANAGED_CONVERSION_PROVIDER_DEFINITIONS = Object.freeze([
  googleAdsProviderDefinition,
  yelpProviderDefinition,
] as const);

export function createManagedConversionAdapterRegistry(
  args: { env?: Record<string, string | undefined>; httpClient?: ProviderHttpClient } = {},
): ManagedConversionFeedbackAdapter[] {
  return [
    createManualConversionFeedbackAdapter(),
    createGoogleAdsManagedConversionAdapter(args),
    createYelpManagedConversionAdapter(args),
  ];
}
