export const LEAD_EVENT_CONTRACT_VERSION = 'craigs-lead-events-v1';

export const LEAD_EVENTS = Object.freeze({
  formSubmitSuccess: 'lead_form_submit_success',
  formSubmitError: 'lead_form_submit_error',
  emailIntakeAccepted: 'lead_email_intake_accepted',
  emailIntakeRejected: 'lead_email_intake_rejected',
  chatFirstMessageSent: 'lead_chat_first_message_sent',
  chatHandoffCompleted: 'lead_chat_handoff_completed',
  chatHandoffBlocked: 'lead_chat_handoff_blocked',
  chatHandoffDeferred: 'lead_chat_handoff_deferred',
  chatHandoffError: 'lead_chat_handoff_error',
  clickToCall: 'lead_click_to_call',
  clickToText: 'lead_click_to_text',
  clickEmail: 'lead_click_email',
  clickDirections: 'lead_click_directions',
  outreachSmsSent: 'lead_outreach_sms_sent',
  outreachSmsFailed: 'lead_outreach_sms_failed',
  outreachEmailSent: 'lead_outreach_email_sent',
  outreachEmailFailed: 'lead_outreach_email_failed',
  quoContactSynced: 'lead_quo_contact_synced',
  quoContactSyncFailed: 'lead_quo_contact_sync_failed',
  recordQualified: 'lead_record_qualified',
  recordUnqualified: 'lead_record_unqualified',
});

function leadEventDefinition(args) {
  return Object.freeze({
    eventClass: args.eventClass,
    customerAction: args.customerAction ?? null,
    captureChannel: args.captureChannel ?? null,
    journeyStatus: args.journeyStatus ?? null,
    leadStrength: args.leadStrength ?? null,
    verificationStatus: args.verificationStatus ?? null,
    workflowOutcome: args.workflowOutcome ?? null,
    lifecyclePhase: args.lifecyclePhase,
    createsLeadRecord: Boolean(args.createsLeadRecord),
    requiresExistingLeadRecord: Boolean(args.requiresExistingLeadRecord),
    browserInteraction: Boolean(args.browserInteraction),
    dataLayer: Boolean(args.dataLayer),
  });
}

export const LEAD_EVENT_DEFINITIONS = Object.freeze({
  [LEAD_EVENTS.formSubmitSuccess]: leadEventDefinition({
    eventClass: 'customer_action',
    customerAction: 'form_submit',
    captureChannel: 'form',
    journeyStatus: 'captured',
    leadStrength: 'captured_lead',
    verificationStatus: 'unverified',
    lifecyclePhase: 'lead_promotion',
    createsLeadRecord: true,
    dataLayer: true,
  }),
  [LEAD_EVENTS.formSubmitError]: leadEventDefinition({
    eventClass: 'diagnostic',
    lifecyclePhase: 'diagnostic',
    dataLayer: true,
  }),
  [LEAD_EVENTS.emailIntakeAccepted]: leadEventDefinition({
    eventClass: 'customer_action',
    customerAction: 'email_received',
    captureChannel: 'email',
    journeyStatus: 'captured',
    leadStrength: 'captured_lead',
    verificationStatus: 'verified_email',
    lifecyclePhase: 'lead_promotion',
    createsLeadRecord: true,
  }),
  [LEAD_EVENTS.emailIntakeRejected]: leadEventDefinition({
    eventClass: 'diagnostic',
    workflowOutcome: 'email_intake_rejected',
    lifecyclePhase: 'diagnostic',
  }),
  [LEAD_EVENTS.chatFirstMessageSent]: leadEventDefinition({
    eventClass: 'customer_action',
    customerAction: 'chat_first_message_sent',
    journeyStatus: 'active',
    leadStrength: 'soft_intent',
    verificationStatus: 'unverified',
    lifecyclePhase: 'journey_interaction',
    browserInteraction: true,
    dataLayer: true,
  }),
  [LEAD_EVENTS.chatHandoffCompleted]: leadEventDefinition({
    eventClass: 'workflow',
    captureChannel: 'chat',
    journeyStatus: 'captured',
    leadStrength: 'captured_lead',
    verificationStatus: 'unverified',
    workflowOutcome: 'chat_handoff_completed',
    lifecyclePhase: 'lead_promotion',
    createsLeadRecord: true,
    dataLayer: true,
  }),
  [LEAD_EVENTS.chatHandoffBlocked]: leadEventDefinition({
    eventClass: 'workflow',
    journeyStatus: 'incomplete',
    workflowOutcome: 'chat_handoff_blocked',
    lifecyclePhase: 'lead_workflow',
    dataLayer: true,
  }),
  [LEAD_EVENTS.chatHandoffDeferred]: leadEventDefinition({
    eventClass: 'workflow',
    journeyStatus: 'active',
    workflowOutcome: 'chat_handoff_deferred',
    lifecyclePhase: 'lead_workflow',
    dataLayer: true,
  }),
  [LEAD_EVENTS.chatHandoffError]: leadEventDefinition({
    eventClass: 'workflow',
    journeyStatus: 'active',
    workflowOutcome: 'chat_handoff_error',
    lifecyclePhase: 'lead_workflow',
    dataLayer: true,
  }),
  [LEAD_EVENTS.clickToCall]: leadEventDefinition({
    eventClass: 'customer_action',
    customerAction: 'click_call',
    journeyStatus: 'active',
    leadStrength: 'soft_intent',
    verificationStatus: 'unverified',
    lifecyclePhase: 'journey_interaction',
    browserInteraction: true,
    dataLayer: true,
  }),
  [LEAD_EVENTS.clickToText]: leadEventDefinition({
    eventClass: 'customer_action',
    customerAction: 'click_text',
    journeyStatus: 'active',
    leadStrength: 'soft_intent',
    verificationStatus: 'unverified',
    lifecyclePhase: 'journey_interaction',
    browserInteraction: true,
    dataLayer: true,
  }),
  [LEAD_EVENTS.clickEmail]: leadEventDefinition({
    eventClass: 'customer_action',
    customerAction: 'click_email',
    journeyStatus: 'active',
    leadStrength: 'soft_intent',
    verificationStatus: 'unverified',
    lifecyclePhase: 'journey_interaction',
    browserInteraction: true,
    dataLayer: true,
  }),
  [LEAD_EVENTS.clickDirections]: leadEventDefinition({
    eventClass: 'customer_action',
    customerAction: 'click_directions',
    journeyStatus: 'active',
    leadStrength: 'soft_intent',
    verificationStatus: 'unverified',
    lifecyclePhase: 'journey_interaction',
    browserInteraction: true,
    dataLayer: true,
  }),
  [LEAD_EVENTS.outreachSmsSent]: leadEventDefinition({
    eventClass: 'system',
    workflowOutcome: 'outreach_sms_sent',
    lifecyclePhase: 'lead_workflow',
    requiresExistingLeadRecord: true,
  }),
  [LEAD_EVENTS.outreachSmsFailed]: leadEventDefinition({
    eventClass: 'system',
    workflowOutcome: 'outreach_sms_failed',
    lifecyclePhase: 'lead_workflow',
    requiresExistingLeadRecord: true,
  }),
  [LEAD_EVENTS.outreachEmailSent]: leadEventDefinition({
    eventClass: 'system',
    workflowOutcome: 'outreach_email_sent',
    lifecyclePhase: 'lead_workflow',
    requiresExistingLeadRecord: true,
  }),
  [LEAD_EVENTS.outreachEmailFailed]: leadEventDefinition({
    eventClass: 'system',
    workflowOutcome: 'outreach_email_failed',
    lifecyclePhase: 'lead_workflow',
    requiresExistingLeadRecord: true,
  }),
  [LEAD_EVENTS.quoContactSynced]: leadEventDefinition({
    eventClass: 'system',
    workflowOutcome: 'quo_contact_synced',
    lifecyclePhase: 'lead_workflow',
    requiresExistingLeadRecord: true,
  }),
  [LEAD_EVENTS.quoContactSyncFailed]: leadEventDefinition({
    eventClass: 'system',
    workflowOutcome: 'quo_contact_sync_failed',
    lifecyclePhase: 'lead_workflow',
    requiresExistingLeadRecord: true,
  }),
  [LEAD_EVENTS.recordQualified]: leadEventDefinition({
    eventClass: 'verification',
    journeyStatus: 'qualified',
    leadStrength: 'qualified_lead',
    verificationStatus: 'qualified',
    workflowOutcome: 'qualified',
    lifecyclePhase: 'lead_verification',
    requiresExistingLeadRecord: true,
  }),
  [LEAD_EVENTS.recordUnqualified]: leadEventDefinition({
    eventClass: 'verification',
    journeyStatus: 'captured',
    leadStrength: 'captured_lead',
    verificationStatus: 'unverified',
    workflowOutcome: 'unqualified',
    lifecyclePhase: 'lead_verification',
    requiresExistingLeadRecord: true,
  }),
});

export const LEAD_EVENT_NAMES = Object.freeze(Object.values(LEAD_EVENTS));

export const LEAD_INTERACTION_EVENT_NAMES = Object.freeze(
  LEAD_EVENT_NAMES.filter((eventName) => LEAD_EVENT_DEFINITIONS[eventName]?.browserInteraction),
);

export const LEAD_DATA_LAYER_EVENT_NAMES = Object.freeze(
  LEAD_EVENT_NAMES.filter((eventName) => LEAD_EVENT_DEFINITIONS[eventName]?.dataLayer),
);

export function getLeadEventDefinition(eventName) {
  return LEAD_EVENT_DEFINITIONS[eventName] ?? null;
}

export function isLeadEventName(value) {
  return typeof value === 'string' && Boolean(getLeadEventDefinition(value));
}

export function isLeadInteractionEventName(value) {
  const definition = typeof value === 'string' ? getLeadEventDefinition(value) : null;
  return Boolean(definition?.browserInteraction);
}

export function isLeadDataLayerEventName(value) {
  const definition = typeof value === 'string' ? getLeadEventDefinition(value) : null;
  return Boolean(definition?.dataLayer);
}

export function buildLeadDataLayerEvent(eventName, params = {}) {
  const definition = getLeadEventDefinition(eventName);
  if (!definition?.dataLayer) return null;

  return {
    event: eventName,
    ...params,
    lead_event_contract: LEAD_EVENT_CONTRACT_VERSION,
    event_class: definition.eventClass,
    customer_action: definition.customerAction,
    capture_channel: definition.captureChannel,
    lead_strength: definition.leadStrength,
    verification_status: definition.verificationStatus,
    workflow_outcome: definition.workflowOutcome,
  };
}
