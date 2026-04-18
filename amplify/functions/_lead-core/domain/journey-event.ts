import type { CaptureChannel, CustomerAction } from './lead-actions.ts';

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

export type LeadStrength = 'soft_intent' | 'captured_lead' | 'qualified_lead';

export type LeadVerificationStatus =
  | 'unverified'
  | 'verified_call'
  | 'verified_text'
  | 'verified_email'
  | 'qualified';

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
