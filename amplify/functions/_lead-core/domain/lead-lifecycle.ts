import type { JourneyEventName } from './types.ts';

export const LEAD_INTERACTION_EVENT_NAMES = [
  'lead_chat_first_message_sent',
  'lead_click_to_call',
  'lead_click_to_text',
  'lead_click_email',
  'lead_click_directions',
] as const satisfies readonly JourneyEventName[];

export type LeadInteractionEventName = (typeof LEAD_INTERACTION_EVENT_NAMES)[number];

export const LEAD_PROMOTION_EVENT_NAMES = [
  'lead_form_submit_success',
  'lead_chat_handoff_completed',
] as const satisfies readonly JourneyEventName[];

export type LeadPromotionEventName = (typeof LEAD_PROMOTION_EVENT_NAMES)[number];

export const LEAD_WORKFLOW_EVENT_NAMES = [
  'lead_chat_handoff_blocked',
  'lead_chat_handoff_deferred',
  'lead_chat_handoff_error',
  'lead_outreach_sms_sent',
  'lead_outreach_sms_failed',
  'lead_outreach_email_sent',
  'lead_outreach_email_failed',
  'lead_quo_contact_synced',
  'lead_quo_contact_sync_failed',
] as const satisfies readonly JourneyEventName[];

export type LeadWorkflowEventName = (typeof LEAD_WORKFLOW_EVENT_NAMES)[number];

export const LEAD_VERIFICATION_EVENT_NAMES = [
  'lead_record_qualified',
  'lead_record_unqualified',
] as const satisfies readonly JourneyEventName[];

export type LeadVerificationEventName = (typeof LEAD_VERIFICATION_EVENT_NAMES)[number];

export type LeadLifecyclePhase =
  | 'journey_interaction'
  | 'lead_promotion'
  | 'lead_workflow'
  | 'lead_verification'
  | 'diagnostic';

export type LeadLifecycleRule = {
  createsLeadRecord: boolean;
  phase: LeadLifecyclePhase;
  requiresExistingLeadRecord: boolean;
};

const LEAD_LIFECYCLE_RULES: Record<JourneyEventName, LeadLifecycleRule> = {
  lead_form_submit_success: {
    createsLeadRecord: true,
    phase: 'lead_promotion',
    requiresExistingLeadRecord: false,
  },
  lead_form_submit_error: {
    createsLeadRecord: false,
    phase: 'diagnostic',
    requiresExistingLeadRecord: false,
  },
  lead_chat_first_message_sent: {
    createsLeadRecord: false,
    phase: 'journey_interaction',
    requiresExistingLeadRecord: false,
  },
  lead_chat_handoff_completed: {
    createsLeadRecord: true,
    phase: 'lead_promotion',
    requiresExistingLeadRecord: false,
  },
  lead_chat_handoff_blocked: {
    createsLeadRecord: false,
    phase: 'lead_workflow',
    requiresExistingLeadRecord: false,
  },
  lead_chat_handoff_deferred: {
    createsLeadRecord: false,
    phase: 'lead_workflow',
    requiresExistingLeadRecord: false,
  },
  lead_chat_handoff_error: {
    createsLeadRecord: false,
    phase: 'lead_workflow',
    requiresExistingLeadRecord: false,
  },
  lead_click_to_call: {
    createsLeadRecord: false,
    phase: 'journey_interaction',
    requiresExistingLeadRecord: false,
  },
  lead_click_to_text: {
    createsLeadRecord: false,
    phase: 'journey_interaction',
    requiresExistingLeadRecord: false,
  },
  lead_click_email: {
    createsLeadRecord: false,
    phase: 'journey_interaction',
    requiresExistingLeadRecord: false,
  },
  lead_click_directions: {
    createsLeadRecord: false,
    phase: 'journey_interaction',
    requiresExistingLeadRecord: false,
  },
  lead_outreach_sms_sent: {
    createsLeadRecord: false,
    phase: 'lead_workflow',
    requiresExistingLeadRecord: true,
  },
  lead_outreach_sms_failed: {
    createsLeadRecord: false,
    phase: 'lead_workflow',
    requiresExistingLeadRecord: true,
  },
  lead_outreach_email_sent: {
    createsLeadRecord: false,
    phase: 'lead_workflow',
    requiresExistingLeadRecord: true,
  },
  lead_outreach_email_failed: {
    createsLeadRecord: false,
    phase: 'lead_workflow',
    requiresExistingLeadRecord: true,
  },
  lead_quo_contact_synced: {
    createsLeadRecord: false,
    phase: 'lead_workflow',
    requiresExistingLeadRecord: true,
  },
  lead_quo_contact_sync_failed: {
    createsLeadRecord: false,
    phase: 'lead_workflow',
    requiresExistingLeadRecord: true,
  },
  lead_record_qualified: {
    createsLeadRecord: false,
    phase: 'lead_verification',
    requiresExistingLeadRecord: true,
  },
  lead_record_unqualified: {
    createsLeadRecord: false,
    phase: 'lead_verification',
    requiresExistingLeadRecord: true,
  },
};

export function getLeadLifecycleRule(eventName: JourneyEventName): LeadLifecycleRule {
  return LEAD_LIFECYCLE_RULES[eventName];
}

export function isLeadInteractionEventName(value: string): value is LeadInteractionEventName {
  return LEAD_INTERACTION_EVENT_NAMES.includes(value as LeadInteractionEventName);
}

export function isLeadPromotionEventName(
  eventName: JourneyEventName,
): eventName is LeadPromotionEventName {
  return getLeadLifecycleRule(eventName).phase === 'lead_promotion';
}

export function eventCreatesLeadRecord(eventName: JourneyEventName): boolean {
  return getLeadLifecycleRule(eventName).createsLeadRecord;
}

export function eventRequiresExistingLeadRecord(eventName: JourneyEventName): boolean {
  return getLeadLifecycleRule(eventName).requiresExistingLeadRecord;
}
