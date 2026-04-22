import type {
  ContactEvidenceConfidence,
  ContactEvidenceSourceChannel,
  ContactEvidenceSourceMethod,
} from './contact.ts';

export type LeadContactObservationKind = 'name' | 'email' | 'phone' | 'identity_conflict';

export type LeadContactObservation = {
  contact_id: string;
  observation_sort_key: string;
  observation_id: string;
  kind: LeadContactObservationKind;
  observed_value: string | null;
  normalized_value: string | null;
  confidence: ContactEvidenceConfidence;
  source_channel: ContactEvidenceSourceChannel;
  source_method: ContactEvidenceSourceMethod;
  source_event_id: string | null;
  occurred_at_ms: number;
  recorded_at_ms: number;
  metadata: Record<string, unknown> | null;
};
