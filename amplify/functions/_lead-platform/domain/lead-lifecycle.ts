import {
  LEAD_INTERACTION_EVENT_NAMES as CONTRACT_LEAD_INTERACTION_EVENT_NAMES,
  LEAD_EVENT_NAMES,
  getLeadEventDefinition,
  isLeadInteractionEventName as isContractLeadInteractionEventName,
} from '@craigs/contracts/lead-event-contract';
import type { JourneyEventName, LeadLifecyclePhase } from '@craigs/contracts/lead-event-contract';

export const LEAD_INTERACTION_EVENT_NAMES = CONTRACT_LEAD_INTERACTION_EVENT_NAMES;

export type LeadInteractionEventName = (typeof LEAD_INTERACTION_EVENT_NAMES)[number];

export const LEAD_PROMOTION_EVENT_NAMES = LEAD_EVENT_NAMES.filter(
  (eventName) => getLeadEventDefinition(eventName)?.lifecyclePhase === 'lead_promotion',
) as readonly JourneyEventName[];

export type LeadPromotionEventName = (typeof LEAD_PROMOTION_EVENT_NAMES)[number];

export const LEAD_WORKFLOW_EVENT_NAMES = LEAD_EVENT_NAMES.filter(
  (eventName) => getLeadEventDefinition(eventName)?.lifecyclePhase === 'lead_workflow',
) as readonly JourneyEventName[];

export type LeadWorkflowEventName = (typeof LEAD_WORKFLOW_EVENT_NAMES)[number];

export const LEAD_VERIFICATION_EVENT_NAMES = LEAD_EVENT_NAMES.filter(
  (eventName) => getLeadEventDefinition(eventName)?.lifecyclePhase === 'lead_verification',
) as readonly JourneyEventName[];

export type LeadVerificationEventName = (typeof LEAD_VERIFICATION_EVENT_NAMES)[number];

export type LeadLifecycleRule = {
  createsLeadRecord: boolean;
  phase: LeadLifecyclePhase;
  requiresExistingLeadRecord: boolean;
};

export function getLeadLifecycleRule(eventName: JourneyEventName): LeadLifecycleRule {
  const definition = getLeadEventDefinition(eventName);
  if (!definition) {
    throw new Error(`Unknown lead event: ${eventName}`);
  }

  return {
    createsLeadRecord: definition.createsLeadRecord,
    phase: definition.lifecyclePhase,
    requiresExistingLeadRecord: definition.requiresExistingLeadRecord,
  };
}

export function isLeadInteractionEventName(value: string): value is LeadInteractionEventName {
  return isContractLeadInteractionEventName(value);
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
