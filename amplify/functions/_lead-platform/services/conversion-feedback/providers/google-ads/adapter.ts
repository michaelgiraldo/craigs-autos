import type { ManagedConversionFeedbackAdapter } from '../../adapter-types.ts';
import { createAdapterFromProviderDefinition } from '../../provider-definition.ts';
import type { ProviderHttpClient } from '../../provider-http.ts';
import { googleAdsProviderDefinition } from './definition.ts';

export function createGoogleAdsManagedConversionAdapter(
  args: { env?: Record<string, string | undefined>; httpClient?: ProviderHttpClient } = {},
): ManagedConversionFeedbackAdapter {
  return createAdapterFromProviderDefinition(googleAdsProviderDefinition, args);
}
