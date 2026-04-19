import type { ManagedConversionFeedbackAdapter } from './adapter-types.ts';
import type { ProviderHttpClient } from './provider-http.ts';
import { createGoogleAdsManagedConversionAdapter } from './providers/google-ads/index.ts';
import { createManualConversionFeedbackAdapter } from './providers/manual/adapter.ts';
import { createYelpManagedConversionAdapter } from './providers/yelp/index.ts';

export function createManagedConversionAdapterRegistry(
  args: { env?: Record<string, string | undefined>; httpClient?: ProviderHttpClient } = {},
): ManagedConversionFeedbackAdapter[] {
  return [
    createManualConversionFeedbackAdapter(),
    createGoogleAdsManagedConversionAdapter(args),
    createYelpManagedConversionAdapter(args),
  ];
}
