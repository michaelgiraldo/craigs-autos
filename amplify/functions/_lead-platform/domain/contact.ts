export type LeadContact = {
  contact_id: string;
  normalized_phone: string | null;
  normalized_email: string | null;
  primary_phone_contact_point_id: string | null;
  primary_email_contact_point_id: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  display_name_confidence: ContactEvidenceConfidence | null;
  display_name_source_channel: ContactEvidenceSourceChannel | null;
  display_name_source_method: ContactEvidenceSourceMethod | null;
  raw_phone: string | null;
  raw_email: string | null;
  created_at_ms: number;
  updated_at_ms: number;
};

export type ContactEvidenceSourceChannel = 'form' | 'email' | 'chat' | 'admin' | 'provider';

export type ContactEvidenceSourceMethod =
  | 'typed'
  | 'ai_extracted'
  | 'email_header'
  | 'detected'
  | 'provider_sync'
  | 'system';

export type ContactEvidenceConfidence = 'high' | 'medium' | 'low';

export type LeadContactPointType = 'email' | 'phone';

export type LeadContactPointEligibility = 'eligible' | 'not_eligible' | 'unknown';
