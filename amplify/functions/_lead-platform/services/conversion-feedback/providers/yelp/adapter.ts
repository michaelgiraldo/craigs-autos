import type { ManagedConversionFeedbackAdapter } from '../../adapter-types.ts';
import { createAdapterFromProviderDefinition } from '../../provider-definition.ts';
import type { ProviderHttpClient } from '../../provider-http.ts';
import { yelpProviderDefinition } from './definition.ts';

export function createYelpManagedConversionAdapter(
  args: { env?: Record<string, string | undefined>; httpClient?: ProviderHttpClient } = {},
): ManagedConversionFeedbackAdapter {
  return createAdapterFromProviderDefinition(yelpProviderDefinition, args);
}
