import {
  createClientEventId,
  createStableJourneyId,
  createStableLeadRecordId,
} from '../domain/ids.ts';
import { LEAD_EVENTS } from '../../../../shared/lead-event-contract.js';
import { buildLeadTitle, normalizeLocale, trimToNull } from '../domain/normalize.ts';
import type { AttributionSnapshot } from '../domain/attribution.ts';
import type { JourneyBundle } from '../domain/lead-bundle.ts';
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
  project?: string | null;
  summary?: string | null;
  customerLanguage?: string | null;
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
  const project = trimToNull(input.project, 160);
  const summary = trimToNull(input.summary, 4_000);

  const journey: Journey = {
    journey_id: journeyId,
    lead_record_id: leadRecordId,
    contact_id: contact?.contact_id ?? null,
    journey_status: 'captured',
    status_reason: trimToNull(input.reason, 120),
    capture_channel: 'chat',
    first_action: null,
    latest_action: null,
    action_types: [],
    action_count: 0,
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
      project,
      message: summary,
      displayName: contact?.display_name ?? null,
    }),
    vehicle: null,
    service: null,
    project_summary: project ?? summary,
    customer_message: summary,
    customer_language: trimToNull(input.customerLanguage, 64),
    attribution: input.attribution ?? null,
    latest_outreach: latestOutreach,
    qualification,
    first_action: null,
    latest_action: null,
    action_types: [],
    action_count: 0,
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
      clientEventId: input.clientEventId ?? createClientEventId('chat_handoff'),
      discriminator: input.threadId,
      payload: {
        metadata,
        reason: trimToNull(input.reason, 120),
        normalized_phone: contact?.normalized_phone ?? null,
        normalized_email: contact?.normalized_email ?? null,
        project,
        summary,
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
