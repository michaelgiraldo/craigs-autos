import {
  MANAGED_CONVERSION_DESTINATIONS,
  parseManagedConversionDestinations,
  type ManagedConversionDestinationKey,
} from '@craigs/contracts/managed-conversion-contract';
import type { ProviderConversionDestination } from '../domain/conversion-feedback.ts';
import type { ProviderConversionDestinationsRepo } from '../repos/provider-conversion-destinations-repo.ts';

export function buildProviderConversionDestination(args: {
  destinationKey: ManagedConversionDestinationKey;
  nowMs: number;
  existing?: ProviderConversionDestination | null;
}): ProviderConversionDestination {
  const definition = MANAGED_CONVERSION_DESTINATIONS[args.destinationKey];

  return {
    destination_key: args.destinationKey,
    destination_label: definition.label,
    enabled: true,
    delivery_mode: args.destinationKey === 'manual_export' ? 'manual' : 'provider_api',
    config_source: 'environment',
    provider_config: args.existing?.provider_config ?? {},
    created_at_ms: args.existing?.created_at_ms ?? args.nowMs,
    updated_at_ms: args.nowMs,
  };
}

export async function resolveProviderConversionDestinations(args: {
  repo: ProviderConversionDestinationsRepo;
  configuredDestinationKeys: ManagedConversionDestinationKey[] | string | null | undefined;
  nowMs: number;
  persistConfiguredDestinations?: boolean;
}): Promise<ProviderConversionDestination[]> {
  const destinationKeys = parseManagedConversionDestinations(args.configuredDestinationKeys);
  const persisted = await args.repo.listEnabled();
  const byKey = new Map(persisted.map((destination) => [destination.destination_key, destination]));

  for (const destinationKey of destinationKeys) {
    const existing = byKey.get(destinationKey) ?? (await args.repo.getByKey(destinationKey));
    const destination = existing?.enabled
      ? existing
      : buildProviderConversionDestination({
          destinationKey,
          nowMs: args.nowMs,
          existing,
        });

    byKey.set(destinationKey, destination);

    if (args.persistConfiguredDestinations && !existing?.enabled) {
      await args.repo.put(destination);
    }
  }

  const destinations: ProviderConversionDestination[] = [];
  byKey.forEach((destination) => {
    if (destination.enabled) destinations.push(destination);
  });
  return destinations.sort((a, b) => a.destination_key.localeCompare(b.destination_key));
}
