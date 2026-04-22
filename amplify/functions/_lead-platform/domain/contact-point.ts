import type {
  ContactEvidenceConfidence,
  ContactEvidenceSourceChannel,
  ContactEvidenceSourceMethod,
  LeadContactPointEligibility,
  LeadContactPointType,
} from './contact.ts';

export type LeadContactPoint = {
  contact_point_id: string;
  contact_id: string;
  type: LeadContactPointType;
  raw_value: string;
  normalized_value: string;
  eligibility: LeadContactPointEligibility;
  confidence: ContactEvidenceConfidence;
  source_channel: ContactEvidenceSourceChannel;
  source_method: ContactEvidenceSourceMethod;
  source_event_id: string | null;
  created_at_ms: number;
  updated_at_ms: number;
};
