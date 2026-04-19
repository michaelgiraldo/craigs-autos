import type { Journey } from '../domain/journey.ts';
import { dedupeStrings } from '../domain/normalize.ts';
import { applyJourneyStatusTransition } from './journey-status.ts';

export function mergeJourneys(current: Journey, incoming: Journey): Journey {
  const actionTypes = dedupeStrings([
    ...current.action_types,
    ...incoming.action_types,
  ]) as Journey['action_types'];
  const transition = applyJourneyStatusTransition({
    currentStatus: current.journey_status,
    currentReason: current.status_reason,
    incomingStatus: incoming.journey_status,
    incomingReason: incoming.status_reason,
  });

  return {
    ...current,
    lead_record_id: incoming.lead_record_id ?? current.lead_record_id,
    contact_id: incoming.contact_id ?? current.contact_id,
    journey_status: transition.journeyStatus ?? current.journey_status,
    status_reason: transition.statusReason,
    capture_channel: current.capture_channel ?? incoming.capture_channel,
    first_action: current.first_action ?? incoming.first_action,
    latest_action: incoming.latest_action ?? current.latest_action,
    action_types: actionTypes,
    action_count: Math.max(current.action_count, incoming.action_count, actionTypes.length),
    lead_user_id: current.lead_user_id ?? incoming.lead_user_id,
    thread_id: current.thread_id ?? incoming.thread_id,
    locale: current.locale ?? incoming.locale,
    page_url: current.page_url ?? incoming.page_url,
    page_path: current.page_path ?? incoming.page_path,
    origin: current.origin ?? incoming.origin,
    site_label: current.site_label ?? incoming.site_label,
    attribution: current.attribution ?? incoming.attribution,
    created_at_ms: Math.min(current.created_at_ms, incoming.created_at_ms),
    updated_at_ms: Math.max(current.updated_at_ms, incoming.updated_at_ms),
  };
}
