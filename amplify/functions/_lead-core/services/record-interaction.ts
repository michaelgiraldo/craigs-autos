import { createClientEventId, createStableJourneyId } from '../domain/ids.ts';
import { getJourneyEventSemantics } from '../domain/lead-semantics.ts';
import { trimToNull } from '../domain/normalize.ts';
import type {
  AttributionSnapshot,
  Journey,
  JourneyEvent,
  JourneyEventName,
  JourneyMetadata,
} from '../domain/types.ts';
import { buildJourneyEvent } from './shared.ts';

export type JourneySignalEventName =
  | 'lead_chat_first_message_sent'
  | 'lead_click_to_call'
  | 'lead_click_to_text'
  | 'lead_click_email'
  | 'lead_click_directions';

export type JourneySignalInput = {
  eventName: JourneySignalEventName;
  occurredAtMs: number;
  recordedAtMs: number;
  providedJourneyId?: string | null;
  clientEventId?: string | null;
  userId?: string | null;
  threadId?: string | null;
  pageUrl?: string | null;
  pagePath?: string | null;
  clickUrl?: string | null;
  locale?: string | null;
  provider?: string | null;
  attribution?: AttributionSnapshot | null;
};

function pagePathFromUrl(value: string | null | undefined): string | null {
  const trimmed = trimToNull(value, 500);
  if (!trimmed) return null;
  try {
    return new URL(trimmed).pathname || null;
  } catch {
    return trimmed.startsWith('/') ? trimmed : null;
  }
}

export function buildJourneySignal(input: JourneySignalInput): {
  journey: Journey;
  event: JourneyEvent;
} {
  const metadata: JourneyMetadata = {
    lead_user_id: trimToNull(input.userId, 160),
    thread_id: trimToNull(input.threadId, 160),
    locale: trimToNull(input.locale, 32),
    page_url: trimToNull(input.pageUrl, 500),
    page_path: trimToNull(input.pagePath, 500) ?? pagePathFromUrl(input.pageUrl),
    origin: null,
    site_label: null,
    attribution: input.attribution ?? null,
  };
  const journeyId = createStableJourneyId({
    providedJourneyId: input.providedJourneyId,
    fallbackKind: input.eventName,
    fallbackValue:
      metadata.thread_id ??
      metadata.lead_user_id ??
      metadata.page_url ??
      input.clickUrl ??
      `${input.occurredAtMs}`,
  });
  const semantics = getJourneyEventSemantics(input.eventName);

  const event = buildJourneyEvent({
    journeyId,
    eventName: input.eventName,
    occurredAtMs: input.occurredAtMs,
    recordedAtMs: input.recordedAtMs,
    actor: 'analytics',
    clientEventId: input.clientEventId ?? createClientEventId('journey'),
    discriminator: input.clickUrl ?? metadata.page_url ?? metadata.thread_id,
    payload: {
      metadata,
      click_url: trimToNull(input.clickUrl, 500),
      provider: trimToNull(input.provider, 120),
    },
  });

  const actionTypes = semantics.customerAction ? [semantics.customerAction] : [];
  const journey: Journey = {
    journey_id: journeyId,
    lead_record_id: null,
    contact_id: null,
    journey_status: semantics.journeyStatus ?? 'active',
    status_reason: null,
    capture_channel: semantics.captureChannel,
    first_action: semantics.customerAction,
    latest_action: semantics.customerAction,
    action_types: actionTypes,
    action_count: actionTypes.length,
    lead_user_id: metadata.lead_user_id,
    thread_id: metadata.thread_id,
    locale: metadata.locale,
    page_url: metadata.page_url,
    page_path: metadata.page_path,
    origin: metadata.origin,
    site_label: metadata.site_label,
    attribution: metadata.attribution,
    created_at_ms: input.occurredAtMs,
    updated_at_ms: input.recordedAtMs,
  };

  return { journey, event };
}
