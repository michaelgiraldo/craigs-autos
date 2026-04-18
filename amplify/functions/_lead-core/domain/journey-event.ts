import type {
  CaptureChannel,
  CustomerAction,
  EventClass,
  JourneyEventName,
  LeadStrength,
  LeadVerificationStatus,
  WorkflowOutcome,
} from '../../../../shared/lead-event-contract.js';

export type {
  EventClass,
  JourneyEventName,
  LeadStrength,
  LeadVerificationStatus,
  WorkflowOutcome,
} from '../../../../shared/lead-event-contract.js';

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
