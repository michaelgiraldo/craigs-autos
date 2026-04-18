import type { CaptureChannel, CustomerAction } from './lead-actions.ts';
import type { JourneyStatus } from './journey.ts';
import type {
  EventClass,
  JourneyEventName,
  LeadStrength,
  LeadVerificationStatus,
  WorkflowOutcome,
} from './journey-event.ts';

type JourneyEventSemantics = {
  captureChannel: CaptureChannel | null;
  customerAction: CustomerAction | null;
  eventClass: EventClass;
  journeyStatus: JourneyStatus | null;
  leadStrength: LeadStrength | null;
  verificationStatus: LeadVerificationStatus | null;
  workflowOutcome: WorkflowOutcome | null;
};

const EVENT_SEMANTICS: Record<JourneyEventName, JourneyEventSemantics> = {
  lead_form_submit_success: {
    captureChannel: 'form',
    customerAction: 'form_submit',
    eventClass: 'customer_action',
    journeyStatus: 'captured',
    leadStrength: 'captured_lead',
    verificationStatus: 'unverified',
    workflowOutcome: null,
  },
  lead_form_submit_error: {
    captureChannel: null,
    customerAction: null,
    eventClass: 'diagnostic',
    journeyStatus: null,
    leadStrength: null,
    verificationStatus: null,
    workflowOutcome: null,
  },
  lead_chat_first_message_sent: {
    captureChannel: null,
    customerAction: 'chat_first_message_sent',
    eventClass: 'customer_action',
    journeyStatus: 'active',
    leadStrength: 'soft_intent',
    verificationStatus: 'unverified',
    workflowOutcome: null,
  },
  lead_chat_handoff_completed: {
    captureChannel: 'chat',
    customerAction: null,
    eventClass: 'workflow',
    journeyStatus: 'captured',
    leadStrength: 'captured_lead',
    verificationStatus: 'unverified',
    workflowOutcome: 'chat_handoff_completed',
  },
  lead_chat_handoff_blocked: {
    captureChannel: null,
    customerAction: null,
    eventClass: 'workflow',
    journeyStatus: 'incomplete',
    leadStrength: null,
    verificationStatus: null,
    workflowOutcome: 'chat_handoff_blocked',
  },
  lead_chat_handoff_deferred: {
    captureChannel: null,
    customerAction: null,
    eventClass: 'workflow',
    journeyStatus: 'active',
    leadStrength: null,
    verificationStatus: null,
    workflowOutcome: 'chat_handoff_deferred',
  },
  lead_chat_handoff_error: {
    captureChannel: null,
    customerAction: null,
    eventClass: 'workflow',
    journeyStatus: 'active',
    leadStrength: null,
    verificationStatus: null,
    workflowOutcome: 'chat_handoff_error',
  },
  lead_click_to_call: {
    captureChannel: null,
    customerAction: 'click_call',
    eventClass: 'customer_action',
    journeyStatus: 'active',
    leadStrength: 'soft_intent',
    verificationStatus: 'unverified',
    workflowOutcome: null,
  },
  lead_click_to_text: {
    captureChannel: null,
    customerAction: 'click_text',
    eventClass: 'customer_action',
    journeyStatus: 'active',
    leadStrength: 'soft_intent',
    verificationStatus: 'unverified',
    workflowOutcome: null,
  },
  lead_click_email: {
    captureChannel: null,
    customerAction: 'click_email',
    eventClass: 'customer_action',
    journeyStatus: 'active',
    leadStrength: 'soft_intent',
    verificationStatus: 'unverified',
    workflowOutcome: null,
  },
  lead_click_directions: {
    captureChannel: null,
    customerAction: 'click_directions',
    eventClass: 'customer_action',
    journeyStatus: 'active',
    leadStrength: 'soft_intent',
    verificationStatus: 'unverified',
    workflowOutcome: null,
  },
  lead_outreach_sms_sent: {
    captureChannel: null,
    customerAction: null,
    eventClass: 'system',
    journeyStatus: null,
    leadStrength: null,
    verificationStatus: null,
    workflowOutcome: 'outreach_sms_sent',
  },
  lead_outreach_sms_failed: {
    captureChannel: null,
    customerAction: null,
    eventClass: 'system',
    journeyStatus: null,
    leadStrength: null,
    verificationStatus: null,
    workflowOutcome: 'outreach_sms_failed',
  },
  lead_outreach_email_sent: {
    captureChannel: null,
    customerAction: null,
    eventClass: 'system',
    journeyStatus: null,
    leadStrength: null,
    verificationStatus: null,
    workflowOutcome: 'outreach_email_sent',
  },
  lead_outreach_email_failed: {
    captureChannel: null,
    customerAction: null,
    eventClass: 'system',
    journeyStatus: null,
    leadStrength: null,
    verificationStatus: null,
    workflowOutcome: 'outreach_email_failed',
  },
  lead_quo_contact_synced: {
    captureChannel: null,
    customerAction: null,
    eventClass: 'system',
    journeyStatus: null,
    leadStrength: null,
    verificationStatus: null,
    workflowOutcome: 'quo_contact_synced',
  },
  lead_quo_contact_sync_failed: {
    captureChannel: null,
    customerAction: null,
    eventClass: 'system',
    journeyStatus: null,
    leadStrength: null,
    verificationStatus: null,
    workflowOutcome: 'quo_contact_sync_failed',
  },
  lead_record_qualified: {
    captureChannel: null,
    customerAction: null,
    eventClass: 'verification',
    journeyStatus: 'qualified',
    leadStrength: 'qualified_lead',
    verificationStatus: 'qualified',
    workflowOutcome: 'qualified',
  },
  lead_record_unqualified: {
    captureChannel: null,
    customerAction: null,
    eventClass: 'verification',
    journeyStatus: 'captured',
    leadStrength: 'captured_lead',
    verificationStatus: 'unverified',
    workflowOutcome: 'unqualified',
  },
};

export function getJourneyEventSemantics(eventName: JourneyEventName): JourneyEventSemantics {
  return EVENT_SEMANTICS[eventName];
}

export function inferLeadStrength(eventName: JourneyEventName): LeadStrength | null {
  return getJourneyEventSemantics(eventName).leadStrength;
}

export function inferLeadVerificationStatus(
  eventName: JourneyEventName,
): LeadVerificationStatus | null {
  return getJourneyEventSemantics(eventName).verificationStatus;
}
