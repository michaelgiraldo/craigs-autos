import type { ProviderContactProjection } from '../domain/provider-contact-projection.ts';

export interface ProviderContactProjectionsRepo {
  getById(projectionId: string): Promise<ProviderContactProjection | null>;
  findByProviderExternalId(providerExternalId: string): Promise<ProviderContactProjection | null>;
  listByContactId(contactId: string): Promise<ProviderContactProjection[]>;
  put(projection: ProviderContactProjection): Promise<void>;
}
