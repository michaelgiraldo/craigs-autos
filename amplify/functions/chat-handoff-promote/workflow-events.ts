import type { JourneyEventName } from '@craigs/contracts/lead-event-contract';
import { sanitizeAttributionSnapshot } from '../_lead-platform/domain/attribution.ts';
import { getJourneyEventSemantics } from '../_lead-platform/domain/lead-semantics.ts';
import type { Journey } from '../_lead-platform/domain/journey.ts';
import type { LeadPlatformRepos } from '../_lead-platform/repos/dynamo.ts';
import { buildJourneyEvent } from '../_lead-platform/services/journey-events.ts';
import { applyJourneyStatusTransition } from '../_lead-platform/services/journey-status.ts';

export type ChatWorkflowEventName = Extract<
  JourneyEventName,
  'lead_chat_handoff_blocked' | 'lead_chat_handoff_deferred' | 'lead_chat_handoff_error'
>;

type PersistChatWorkflowEventArgs = {
  repos: LeadPlatformRepos | null;
  journeyId: string;
  threadId: string;
  leadRecordId?: string | null;
  eventName: ChatWorkflowEventName;
  occurredAtMs: number;
  recordedAtMs: number;
  reason: string | null;
  locale: string;
  pageUrl: string;
  userId: string;
  attribution: unknown;
};

function pagePathFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).pathname || null;
  } catch {
    return null;
  }
}

export async function persistChatWorkflowEvent(args: PersistChatWorkflowEventArgs) {
  const repos = args.repos;
  if (!repos) return;

  const existingJourney = await repos.journeys.getById(args.journeyId);
  const semantics = getJourneyEventSemantics(args.eventName);
  const event = buildJourneyEvent({
    journeyId: args.journeyId,
    leadRecordId: args.leadRecordId ?? null,
    eventName: args.eventName,
    occurredAtMs: args.occurredAtMs,
    recordedAtMs: args.recordedAtMs,
    actor: 'system',
    discriminator: `${args.threadId}:${args.eventName}:${args.reason ?? ''}:${args.recordedAtMs}`,
    payload: {
      thread_id: args.threadId,
      reason: args.reason,
      locale: args.locale || null,
      page_url: args.pageUrl || null,
      user_id: args.userId || null,
      attribution: args.attribution ?? null,
    },
  });

  const transition = applyJourneyStatusTransition({
    currentStatus: existingJourney?.journey_status ?? null,
    currentReason: existingJourney?.status_reason ?? null,
    incomingStatus: semantics.journeyStatus,
    incomingReason: args.reason,
  });

  const nextJourney: Journey = existingJourney
    ? {
        ...existingJourney,
        lead_record_id: existingJourney.lead_record_id ?? args.leadRecordId ?? null,
        thread_id: existingJourney.thread_id ?? args.threadId,
        locale: existingJourney.locale ?? (args.locale || null),
        page_url: existingJourney.page_url ?? (args.pageUrl || null),
        attribution: existingJourney.attribution ?? sanitizeAttributionSnapshot(args.attribution),
        journey_status: transition.journeyStatus ?? existingJourney.journey_status,
        status_reason: transition.statusReason,
        capture_channel: existingJourney.capture_channel,
        updated_at_ms: Math.max(existingJourney.updated_at_ms, args.recordedAtMs),
      }
    : {
        journey_id: args.journeyId,
        lead_record_id: args.leadRecordId ?? null,
        contact_id: null,
        journey_status: transition.journeyStatus ?? 'active',
        status_reason: transition.statusReason,
        capture_channel: null,
        first_action: null,
        latest_action: null,
        action_types: [],
        action_count: 0,
        lead_user_id: args.userId || null,
        thread_id: args.threadId,
        locale: args.locale || null,
        page_url: args.pageUrl || null,
        page_path: pagePathFromUrl(args.pageUrl),
        origin: null,
        site_label: null,
        attribution: sanitizeAttributionSnapshot(args.attribution),
        created_at_ms: args.occurredAtMs,
        updated_at_ms: args.recordedAtMs,
      };

  await repos.journeys.put(nextJourney);
  await repos.journeyEvents.append(event);
}
