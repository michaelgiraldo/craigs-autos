import { createStableJourneyId, createStableLeadRecordId } from '../domain/ids.ts';
import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';
import { buildLeadTitle, normalizeLocale, trimToNull } from '../domain/normalize.ts';
import type { AttributionSnapshot } from '../domain/attribution.ts';
import type { JourneyBundle } from '../domain/lead-bundle.ts';
import type { LeadSummary } from '../domain/lead-summary.ts';
import type { Journey, JourneyMetadata } from '../domain/journey.ts';
import type { LeadOutreachSnapshot, LeadQualificationSnapshot } from '../domain/lead-record.ts';
import { buildLeadContact } from './contact-identity.ts';
import { buildJourneyEvent } from './journey-events.ts';
import { createDefaultOutreachSnapshot, deriveLeadRecordStatus } from './outreach.ts';
import { buildDefaultQualificationSnapshot } from './qualification.ts';

export type ChatLeadIntakeInput = {
  threadId: string;
  occurredAt: number;
  journeyId?: string | null;
  clientEventId?: string | null;
  reason?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  vehicle?: string | null;
  service?: string | null;
  project?: string | null;
  summary?: string | null;
  projectSummary?: string | null;
  customerMessage?: string | null;
  customerLanguage?: string | null;
  leadSummary?: LeadSummary | null;
  pageUrl?: string | null;
  locale?: string | null;
  userId?: string | null;
  attribution?: AttributionSnapshot | null;
  latestOutreach?: LeadOutreachSnapshot;
  qualification?: Partial<LeadQualificationSnapshot>;
};

function pagePathFromUrl(value: string | null | undefined): string | null {
  const trimmed = trimToNull(value, 500);
  if (!trimmed) return null;
  try {
    return new URL(trimmed).pathname || null;
  } catch {
    return null;
  }
}

function createStableChatHandoffClientEventId(threadId: string): string {
  const normalizedThreadId = threadId.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return `chat_handoff_${normalizedThreadId || 'unknown'}`.slice(0, 180);
}

export function buildChatLeadBundle(input: ChatLeadIntakeInput): JourneyBundle {
  const occurredAtMs = input.occurredAt;
  const recordedAtMs = occurredAtMs;
  const journeyId = createStableJourneyId({
    providedJourneyId: input.journeyId,
    fallbackKind: 'chat_thread',
    fallbackValue: input.threadId,
  });
  const leadRecordId = createStableLeadRecordId({
    sourceKind: 'journey',
    sourceValue: journeyId,
  });

  const metadata: JourneyMetadata = {
    lead_user_id: trimToNull(input.userId, 160),
    thread_id: trimToNull(input.threadId, 160),
    locale: normalizeLocale(input.locale),
    page_url: trimToNull(input.pageUrl, 500),
    page_path: pagePathFromUrl(input.pageUrl),
    origin: null,
    site_label: null,
    attribution: input.attribution ?? null,
  };

  const contact = buildLeadContact({
    name: input.name,
    phone: input.phone,
    email: input.email,
    quoTags: ['Chat Lead'],
    createdAtMs: occurredAtMs,
  });

  const latestOutreach = input.latestOutreach ?? createDefaultOutreachSnapshot();
  const qualification = buildDefaultQualificationSnapshot(input.qualification);
  const vehicle = trimToNull(input.vehicle ?? input.leadSummary?.vehicle, 160);
  const service = trimToNull(input.service ?? input.leadSummary?.service ?? input.project, 160);
  const projectSummary = trimToNull(
    input.projectSummary ?? input.leadSummary?.project_summary ?? input.summary,
    4_000,
  );
  const customerMessage = trimToNull(
    input.customerMessage ?? input.leadSummary?.customer_message ?? input.summary,
    4_000,
  );
  const actionTypes = ['chat_first_message_sent' as const];

  const journey: Journey = {
    journey_id: journeyId,
    lead_record_id: leadRecordId,
    contact_id: contact?.contact_id ?? null,
    journey_status: 'captured',
    status_reason: trimToNull(input.reason, 120),
    capture_channel: 'chat',
    first_action: 'chat_first_message_sent',
    latest_action: 'chat_first_message_sent',
    action_types: [...actionTypes],
    action_count: actionTypes.length,
    lead_user_id: metadata.lead_user_id,
    thread_id: metadata.thread_id,
    locale: metadata.locale,
    page_url: metadata.page_url,
    page_path: metadata.page_path,
    origin: metadata.origin,
    site_label: metadata.site_label,
    attribution: metadata.attribution,
    created_at_ms: occurredAtMs,
    updated_at_ms: occurredAtMs,
  };

  const leadRecord = {
    lead_record_id: leadRecordId,
    journey_id: journeyId,
    contact_id: contact?.contact_id ?? null,
    status: deriveLeadRecordStatus({ qualification, latestOutreach }),
    capture_channel: 'chat' as const,
    title: buildLeadTitle({
      channel: 'chat',
      vehicle,
      service,
      project: projectSummary,
      message: customerMessage,
      displayName: contact?.display_name ?? null,
    }),
    vehicle,
    service,
    project_summary: projectSummary ?? customerMessage,
    customer_message: customerMessage,
    customer_language: trimToNull(input.customerLanguage, 64),
    lead_summary: input.leadSummary ?? null,
    attribution: input.attribution ?? null,
    latest_outreach: latestOutreach,
    qualification,
    first_action: 'chat_first_message_sent' as const,
    latest_action: 'chat_first_message_sent' as const,
    action_types: [...actionTypes],
    action_count: actionTypes.length,
    created_at_ms: occurredAtMs,
    updated_at_ms: occurredAtMs,
  };

  const events = [
    buildJourneyEvent({
      journeyId,
      leadRecordId,
      eventName: LEAD_EVENTS.chatHandoffCompleted,
      occurredAtMs,
      recordedAtMs,
      actor: 'system',
      clientEventId: input.clientEventId ?? createStableChatHandoffClientEventId(input.threadId),
      discriminator: input.threadId,
      payload: {
        metadata,
        reason: trimToNull(input.reason, 120),
        normalized_phone: contact?.normalized_phone ?? null,
        normalized_email: contact?.normalized_email ?? null,
        vehicle,
        service,
        project_summary: projectSummary,
        customer_message: customerMessage,
        lead_summary: input.leadSummary ?? null,
      },
    }),
  ];

  return {
    contact,
    journey,
    leadRecord,
    events,
  };
}
