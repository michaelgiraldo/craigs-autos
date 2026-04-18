export type DeviceType = 'mobile' | 'desktop';

export type CaptureChannel =
  | 'form'
  | 'chat'
  | 'phone'
  | 'text'
  | 'email'
  | 'directions'
  | 'verified_offline';

export type CustomerAction =
  | 'form_submit'
  | 'chat_first_message_sent'
  | 'click_call'
  | 'click_text'
  | 'click_email'
  | 'click_directions';

export type WorkflowOutcome =
  | 'chat_handoff_completed'
  | 'chat_handoff_blocked'
  | 'chat_handoff_deferred'
  | 'chat_handoff_error'
  | 'outreach_sms_sent'
  | 'outreach_sms_failed'
  | 'outreach_email_sent'
  | 'outreach_email_failed'
  | 'quo_contact_synced'
  | 'quo_contact_sync_failed'
  | 'qualified'
  | 'unqualified';

export type JourneyEventName =
  | 'lead_form_submit_success'
  | 'lead_form_submit_error'
  | 'lead_chat_first_message_sent'
  | 'lead_chat_handoff_completed'
  | 'lead_chat_handoff_blocked'
  | 'lead_chat_handoff_deferred'
  | 'lead_chat_handoff_error'
  | 'lead_click_to_call'
  | 'lead_click_to_text'
  | 'lead_click_email'
  | 'lead_click_directions'
  | 'lead_outreach_sms_sent'
  | 'lead_outreach_sms_failed'
  | 'lead_outreach_email_sent'
  | 'lead_outreach_email_failed'
  | 'lead_quo_contact_synced'
  | 'lead_quo_contact_sync_failed'
  | 'lead_record_qualified'
  | 'lead_record_unqualified';

export type EventClass = 'customer_action' | 'diagnostic' | 'workflow' | 'verification' | 'system';

export type AcquisitionClass = 'paid' | 'organic' | 'owned' | 'referral' | 'direct';

export type LeadStrength = 'soft_intent' | 'captured_lead' | 'qualified_lead';

export type LeadVerificationStatus =
  | 'unverified'
  | 'verified_call'
  | 'verified_text'
  | 'verified_email'
  | 'qualified';

export type JourneyStatus =
  | 'active'
  | 'captured'
  | 'incomplete'
  | 'verified'
  | 'qualified'
  | 'archived';

export type LeadRecordStatus =
  | 'new'
  | 'ready_for_outreach'
  | 'outreach_sent'
  | 'awaiting_customer'
  | 'qualified'
  | 'archived'
  | 'error';

export type AttributionSnapshot = {
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  msclkid: string | null;
  fbclid: string | null;
  ttclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  first_touch_ts: string | null;
  last_touch_ts: string | null;
  landing_page: string | null;
  referrer: string | null;
  referrer_host: string | null;
  device_type: DeviceType | null;
  source_platform: string | null;
  acquisition_class: AcquisitionClass | null;
  click_id_type: string | null;
};

export type JourneyMetadata = {
  lead_user_id: string | null;
  thread_id: string | null;
  locale: string | null;
  page_url: string | null;
  page_path: string | null;
  origin: string | null;
  site_label: string | null;
  attribution: AttributionSnapshot | null;
};

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

export type LeadOutreachChannel = 'sms' | 'email' | null;

export type LeadOutreachStatus = 'sent' | 'failed' | 'skipped' | 'not_attempted';

export type LeadOutreachProvider = 'quo' | 'ses' | null;

export type LeadOutreachSnapshot = {
  channel: LeadOutreachChannel;
  status: LeadOutreachStatus;
  provider: LeadOutreachProvider;
  external_id: string | null;
  error: string | null;
  sent_at_ms: number | null;
};

export type LeadQualificationSnapshot = {
  qualified: boolean;
  qualified_at_ms: number | null;
  uploaded_google_ads: boolean;
  uploaded_google_ads_at_ms: number | null;
};

export type Journey = {
  journey_id: string;
  lead_record_id: string | null;
  contact_id: string | null;
  journey_status: JourneyStatus;
  status_reason: string | null;
  capture_channel: CaptureChannel | null;
  first_action: CustomerAction | null;
  latest_action: CustomerAction | null;
  action_types: CustomerAction[];
  action_count: number;
  lead_user_id: string | null;
  thread_id: string | null;
  locale: string | null;
  page_url: string | null;
  page_path: string | null;
  origin: string | null;
  site_label: string | null;
  attribution: AttributionSnapshot | null;
  created_at_ms: number;
  updated_at_ms: number;
};

export type JourneyEventActor = 'system' | 'customer' | 'admin' | 'analytics' | 'migration';

export type JourneyEvent = {
  journey_id: string;
  event_sort_key: string;
  journey_event_id: string;
  client_event_id: string | null;
  lead_record_id: string | null;
  event_name: JourneyEventName;
  event_class: EventClass;
  customer_action: CustomerAction | null;
  workflow_outcome: WorkflowOutcome | null;
  capture_channel: CaptureChannel | null;
  lead_strength: LeadStrength | null;
  verification_status: LeadVerificationStatus | null;
  occurred_at_ms: number;
  recorded_at_ms: number;
  actor: JourneyEventActor;
  payload: Record<string, unknown>;
};

export type LeadRecord = {
  lead_record_id: string;
  journey_id: string;
  contact_id: string | null;
  status: LeadRecordStatus;
  capture_channel: CaptureChannel;
  title: string;
  vehicle: string | null;
  service: string | null;
  project_summary: string | null;
  customer_message: string | null;
  customer_language: string | null;
  attribution: AttributionSnapshot | null;
  latest_outreach: LeadOutreachSnapshot;
  qualification: LeadQualificationSnapshot;
  first_action: CustomerAction | null;
  latest_action: CustomerAction | null;
  action_types: CustomerAction[];
  action_count: number;
  created_at_ms: number;
  updated_at_ms: number;
};

export type JourneyBundle = {
  contact: LeadContact | null;
  journey: Journey;
  leadRecord: LeadRecord | null;
  events: JourneyEvent[];
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
