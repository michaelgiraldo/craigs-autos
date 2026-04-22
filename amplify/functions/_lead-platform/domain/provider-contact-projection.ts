export type ProviderContactProjection = {
  projection_id: string;
  contact_id: string;
  provider: string;
  provider_contact_id: string;
  provider_external_id: string;
  source: string | null;
  external_id: string | null;
  tags: string[];
  metadata: Record<string, unknown> | null;
  created_at_ms: number;
  updated_at_ms: number;
};
