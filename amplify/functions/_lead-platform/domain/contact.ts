export type LeadContact = {
  contact_id: string;
  normalized_phone: string | null;
  normalized_email: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  raw_phone: string | null;
  raw_email: string | null;
  quo_contact_id: string | null;
  quo_tags: string[];
  created_at_ms: number;
  updated_at_ms: number;
};

export type LeadContactSeed = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  quoContactId?: string | null;
  quoTags?: string[];
  createdAtMs: number;
  updatedAtMs?: number;
};
