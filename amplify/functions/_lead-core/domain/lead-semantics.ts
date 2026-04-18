import { getLeadEventDefinition } from '../../../../shared/lead-event-contract.js';
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

export function getJourneyEventSemantics(eventName: JourneyEventName): JourneyEventSemantics {
  const definition = getLeadEventDefinition(eventName);
  if (!definition) {
    throw new Error(`Unknown lead event: ${eventName}`);
  }

  return {
    captureChannel: definition.captureChannel,
    customerAction: definition.customerAction,
    eventClass: definition.eventClass,
    journeyStatus: definition.journeyStatus,
    leadStrength: definition.leadStrength,
    verificationStatus: definition.verificationStatus,
    workflowOutcome: definition.workflowOutcome,
  };
}

export function inferLeadStrength(eventName: JourneyEventName): LeadStrength | null {
  return getJourneyEventSemantics(eventName).leadStrength;
}

export function inferLeadVerificationStatus(
  eventName: JourneyEventName,
): LeadVerificationStatus | null {
  return getJourneyEventSemantics(eventName).verificationStatus;
}
