export declare const LEAD_EVENT_CONTRACT_VERSION: 'craigs-lead-events-v1';

export declare const LEAD_EVENTS: {
  readonly formSubmitSuccess: 'lead_form_submit_success';
  readonly formSubmitError: 'lead_form_submit_error';
  readonly chatFirstMessageSent: 'lead_chat_first_message_sent';
  readonly chatHandoffCompleted: 'lead_chat_handoff_completed';
  readonly chatHandoffBlocked: 'lead_chat_handoff_blocked';
  readonly chatHandoffDeferred: 'lead_chat_handoff_deferred';
  readonly chatHandoffError: 'lead_chat_handoff_error';
  readonly clickToCall: 'lead_click_to_call';
  readonly clickToText: 'lead_click_to_text';
  readonly clickEmail: 'lead_click_email';
  readonly clickDirections: 'lead_click_directions';
  readonly outreachSmsSent: 'lead_outreach_sms_sent';
  readonly outreachSmsFailed: 'lead_outreach_sms_failed';
  readonly outreachEmailSent: 'lead_outreach_email_sent';
  readonly outreachEmailFailed: 'lead_outreach_email_failed';
  readonly quoContactSynced: 'lead_quo_contact_synced';
  readonly quoContactSyncFailed: 'lead_quo_contact_sync_failed';
  readonly recordQualified: 'lead_record_qualified';
  readonly recordUnqualified: 'lead_record_unqualified';
};

export type JourneyEventName = (typeof LEAD_EVENTS)[keyof typeof LEAD_EVENTS];

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

export type EventClass = 'customer_action' | 'diagnostic' | 'workflow' | 'verification' | 'system';

export type LeadStrength = 'soft_intent' | 'captured_lead' | 'qualified_lead';

export type LeadVerificationStatus =
  | 'unverified'
  | 'verified_call'
  | 'verified_text'
  | 'verified_email'
  | 'qualified';

export type JourneyStatus = 'active' | 'captured' | 'incomplete' | 'qualified';

export type LeadLifecyclePhase =
  | 'journey_interaction'
  | 'lead_promotion'
  | 'lead_workflow'
  | 'lead_verification'
  | 'diagnostic';

export type LeadEventDefinition = {
  readonly eventClass: EventClass;
  readonly customerAction: CustomerAction | null;
  readonly captureChannel: CaptureChannel | null;
  readonly journeyStatus: JourneyStatus | null;
  readonly leadStrength: LeadStrength | null;
  readonly verificationStatus: LeadVerificationStatus | null;
  readonly workflowOutcome: WorkflowOutcome | null;
  readonly lifecyclePhase: LeadLifecyclePhase;
  readonly createsLeadRecord: boolean;
  readonly requiresExistingLeadRecord: boolean;
  readonly browserInteraction: boolean;
  readonly dataLayer: boolean;
};

export declare const LEAD_EVENT_DEFINITIONS: Readonly<
  Record<JourneyEventName, LeadEventDefinition>
>;

export declare const LEAD_EVENT_NAMES: readonly [
  'lead_form_submit_success',
  'lead_form_submit_error',
  'lead_chat_first_message_sent',
  'lead_chat_handoff_completed',
  'lead_chat_handoff_blocked',
  'lead_chat_handoff_deferred',
  'lead_chat_handoff_error',
  'lead_click_to_call',
  'lead_click_to_text',
  'lead_click_email',
  'lead_click_directions',
  'lead_outreach_sms_sent',
  'lead_outreach_sms_failed',
  'lead_outreach_email_sent',
  'lead_outreach_email_failed',
  'lead_quo_contact_synced',
  'lead_quo_contact_sync_failed',
  'lead_record_qualified',
  'lead_record_unqualified',
];

export type LeadEventName = (typeof LEAD_EVENT_NAMES)[number];

export declare const LEAD_INTERACTION_EVENT_NAMES: readonly [
  'lead_chat_first_message_sent',
  'lead_click_to_call',
  'lead_click_to_text',
  'lead_click_email',
  'lead_click_directions',
];

export type LeadInteractionEventName = (typeof LEAD_INTERACTION_EVENT_NAMES)[number];

export declare const LEAD_DATA_LAYER_EVENT_NAMES: readonly [
  'lead_form_submit_success',
  'lead_form_submit_error',
  'lead_chat_first_message_sent',
  'lead_chat_handoff_completed',
  'lead_chat_handoff_blocked',
  'lead_chat_handoff_deferred',
  'lead_chat_handoff_error',
  'lead_click_to_call',
  'lead_click_to_text',
  'lead_click_email',
  'lead_click_directions',
];

export type LeadDataLayerEventName = (typeof LEAD_DATA_LAYER_EVENT_NAMES)[number];

export declare function getLeadEventDefinition(eventName: JourneyEventName): LeadEventDefinition;
export declare function getLeadEventDefinition(eventName: string): LeadEventDefinition | null;

export declare function isLeadEventName(value: string): value is JourneyEventName;

export declare function isLeadInteractionEventName(
  value: string,
): value is LeadInteractionEventName;

export declare function isLeadDataLayerEventName(value: string): value is LeadDataLayerEventName;

export type LeadDataLayerValue = boolean | number | string | null | undefined;
export type LeadDataLayerParams = Record<string, LeadDataLayerValue>;

export declare function buildLeadDataLayerEvent(
  eventName: LeadDataLayerEventName | string,
  params?: LeadDataLayerParams,
): (LeadDataLayerParams & { event: LeadDataLayerEventName | string }) | null;
