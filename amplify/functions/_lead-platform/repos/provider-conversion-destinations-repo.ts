import type { ManagedConversionDestinationKey } from '@craigs/contracts/managed-conversion-contract';
import type { ProviderConversionDestination } from '../domain/conversion-feedback.ts';

export interface ProviderConversionDestinationsRepo {
  getByKey(
    destinationKey: ManagedConversionDestinationKey,
  ): Promise<ProviderConversionDestination | null>;
  listEnabled(): Promise<ProviderConversionDestination[]>;
  put(destination: ProviderConversionDestination): Promise<void>;
}
