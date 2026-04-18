import { createJourneyEventId, createJourneyEventSortKey } from '../domain/ids.ts';
import { getJourneyEventSemantics } from '../domain/lead-semantics.ts';
import type { JourneyMetadata } from '../domain/journey.ts';
import type { JourneyEvent, JourneyEventActor, JourneyEventName } from '../domain/journey-event.ts';

export function buildJourneyEvent(args: {
  journeyId: string;
  eventName: JourneyEventName;
  occurredAtMs: number;
  recordedAtMs: number;
  actor: JourneyEventActor;
  payload?: Record<string, unknown>;
  leadRecordId?: string | null;
  captureChannel?: JourneyEvent['capture_channel'];
  clientEventId?: string | null;
  discriminator?: string | null;
}): JourneyEvent {
  const semantics = getJourneyEventSemantics(args.eventName);
  const journeyEventId = createJourneyEventId({
    journeyId: args.journeyId,
    eventName: args.eventName,
    occurredAtMs: args.occurredAtMs,
    clientEventId: args.clientEventId,
    discriminator: args.discriminator,
  });

  return {
    journey_id: args.journeyId,
    event_sort_key: createJourneyEventSortKey(args.occurredAtMs, journeyEventId),
    journey_event_id: journeyEventId,
    client_event_id: args.clientEventId ?? null,
    lead_record_id: args.leadRecordId ?? null,
    event_name: args.eventName,
    event_class: semantics.eventClass,
    customer_action: semantics.customerAction,
    workflow_outcome: semantics.workflowOutcome,
    capture_channel: args.captureChannel ?? semantics.captureChannel,
    lead_strength: semantics.leadStrength,
    verification_status: semantics.verificationStatus,
    occurred_at_ms: args.occurredAtMs,
    recorded_at_ms: args.recordedAtMs,
    actor: args.actor,
    payload: args.payload ?? {},
  };
}

export function serializeJourneyMetadata(source: JourneyMetadata): Record<string, unknown> {
  return {
    lead_user_id: source.lead_user_id,
    thread_id: source.thread_id,
    locale: source.locale,
    page_url: source.page_url,
    page_path: source.page_path,
    origin: source.origin,
    site_label: source.site_label,
    attribution: source.attribution,
  };
}
