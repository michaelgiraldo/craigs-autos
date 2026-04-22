import type { ManagedConversionDestinationKey } from '@craigs/contracts/managed-conversion-contract';
import type { ManagedConversionFeedbackAdapter } from './adapter-types.ts';
import {
  createAdapterFromProviderDefinition,
  type ManagedConversionProviderDefinition,
} from './provider-definition.ts';
import type { ProviderHttpClient } from './provider-http.ts';
import { googleAdsProviderDefinition } from './providers/google-ads/definition.ts';
import { manualExportProviderDefinition } from './providers/manual/definition.ts';
import { yelpProviderDefinition } from './providers/yelp/definition.ts';

export const MANAGED_CONVERSION_PROVIDER_DEFINITIONS = Object.freeze([
  manualExportProviderDefinition,
  googleAdsProviderDefinition,
  yelpProviderDefinition,
] as const);

export type ManagedConversionProviderDefinitionEntry =
  (typeof MANAGED_CONVERSION_PROVIDER_DEFINITIONS)[number];

export type ManagedConversionFeedbackProviderResolver = {
  getAdapter(
    destinationKey: ManagedConversionDestinationKey,
  ): ManagedConversionFeedbackAdapter | null;
};

export type ManagedConversionProviderCatalog = ManagedConversionFeedbackProviderResolver & {
  definitions: readonly ManagedConversionProviderDefinitionEntry[];
  getDefinition(
    destinationKey: ManagedConversionDestinationKey,
  ): ManagedConversionProviderDefinitionEntry | null;
};

type CatalogArgs = {
  env?: Record<string, string | undefined>;
  httpClient?: ProviderHttpClient;
  definitions?: readonly ManagedConversionProviderDefinition<unknown, unknown>[];
};

function createProviderAdapter<TConfig, TRequest>(
  definition: ManagedConversionProviderDefinition<TConfig, TRequest>,
  args: { env?: Record<string, string | undefined>; httpClient?: ProviderHttpClient },
): ManagedConversionFeedbackAdapter {
  return createAdapterFromProviderDefinition(definition, args);
}

function assertUniqueProviderKeys(
  definitions: readonly Pick<ManagedConversionProviderDefinition<unknown, unknown>, 'key'>[],
): void {
  const seen = new Set<ManagedConversionDestinationKey>();
  for (const definition of definitions) {
    if (seen.has(definition.key)) {
      throw new Error(`Duplicate managed conversion provider key: ${definition.key}`);
    }
    seen.add(definition.key);
  }
}

export function createManagedConversionProviderCatalog(
  args: CatalogArgs = {},
): ManagedConversionProviderCatalog {
  const definitions = args.definitions ?? MANAGED_CONVERSION_PROVIDER_DEFINITIONS;
  assertUniqueProviderKeys(definitions);

  const definitionsByKey = new Map<
    ManagedConversionDestinationKey,
    ManagedConversionProviderDefinitionEntry
  >();
  const adaptersByKey = new Map<
    ManagedConversionDestinationKey,
    ManagedConversionFeedbackAdapter
  >();

  for (const definition of definitions) {
    const adapter = createProviderAdapter(definition, args);
    definitionsByKey.set(definition.key, definition as ManagedConversionProviderDefinitionEntry);
    adaptersByKey.set(adapter.key, adapter);
  }

  return {
    definitions: [...definitions] as ManagedConversionProviderDefinitionEntry[],
    getDefinition(destinationKey) {
      return definitionsByKey.get(destinationKey) ?? null;
    },
    getAdapter(destinationKey) {
      return adaptersByKey.get(destinationKey) ?? null;
    },
  };
}
