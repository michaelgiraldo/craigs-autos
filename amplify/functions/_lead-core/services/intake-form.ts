import {
  createClientEventId,
  createStableJourneyId,
  createStableLeadRecordId,
} from '../domain/ids.ts';
import {
  buildLeadTitle,
  normalizeLocale,
  normalizeStringList,
  trimToNull,
} from '../domain/normalize.ts';
import type {
  AttributionSnapshot,
  CustomerAction,
  Journey,
  JourneyBundle,
  JourneyMetadata,
  LeadOutreachSnapshot,
  LeadQualificationSnapshot,
} from '../domain/types.ts';
import { createDefaultOutreachSnapshot, deriveLeadRecordStatus } from './outreach.ts';
import {
  buildDefaultQualificationSnapshot,
  buildJourneyEvent,
  buildLeadContact,
} from './shared.ts';

export type FormLeadIntakeInput = {
  submissionId: string;
  occurredAt: number;
  journeyId?: string | null;
  clientEventId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  vehicle?: string | null;
  service?: string | null;
  message?: string | null;
  pageUrl?: string | null;
  locale?: string | null;
  userId?: string | null;
  attribution?: AttributionSnapshot | null;
  origin?: string | null;
  siteLabel?: string | null;
  latestOutreach?: LeadOutreachSnapshot;
  qualification?: Partial<LeadQualificationSnapshot>;
  missingInfo?: string[];
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

export function buildFormLeadBundle(input: FormLeadIntakeInput): JourneyBundle {
  const occurredAtMs = input.occurredAt;
  const recordedAtMs = occurredAtMs;
  const journeyId = createStableJourneyId({
    providedJourneyId: input.journeyId,
    fallbackKind: 'form_submission',
    fallbackValue: input.submissionId,
  });
  const leadRecordId = createStableLeadRecordId({
    sourceKind: 'journey',
    sourceValue: journeyId,
  });

  const metadata: JourneyMetadata = {
    lead_user_id: trimToNull(input.userId, 160),
    thread_id: null,
    locale: normalizeLocale(input.locale),
    page_url: trimToNull(input.pageUrl, 500) ?? trimToNull(input.origin, 500),
    page_path: pagePathFromUrl(input.pageUrl ?? input.origin),
    origin: trimToNull(input.origin, 500),
    site_label: trimToNull(input.siteLabel, 120),
    attribution: input.attribution ?? null,
  };

  const contact = buildLeadContact({
    name: input.name,
    phone: input.phone,
    email: input.email,
    quoTags: ['Form Lead'],
    createdAtMs: occurredAtMs,
  });

  const latestOutreach = input.latestOutreach ?? createDefaultOutreachSnapshot();
  const qualification = buildDefaultQualificationSnapshot(input.qualification);
  const vehicle = trimToNull(input.vehicle, 160);
  const service = trimToNull(input.service, 120);
  const message = trimToNull(input.message, 4_000);
  const actionTypes: CustomerAction[] = ['form_submit'];

  const journey: Journey = {
    journey_id: journeyId,
    lead_record_id: leadRecordId,
    contact_id: contact?.contact_id ?? null,
    journey_status: 'captured',
    status_reason: null,
    capture_channel: 'form',
    first_action: 'form_submit',
    latest_action: 'form_submit',
    action_types: [...actionTypes],
    action_count: 1,
    lead_user_id: metadata.lead_user_id,
    thread_id: null,
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
    capture_channel: 'form' as const,
    title: buildLeadTitle({
      channel: 'form',
      vehicle,
      service,
      message,
      displayName: contact?.display_name ?? null,
    }),
    vehicle,
    service,
    project_summary: message,
    customer_message: message,
    customer_language: null,
    attribution: input.attribution ?? null,
    latest_outreach: latestOutreach,
    qualification,
    first_action: 'form_submit' as const,
    latest_action: 'form_submit' as const,
    action_types: [...actionTypes],
    action_count: 1,
    created_at_ms: occurredAtMs,
    updated_at_ms: occurredAtMs,
  };

  const events = [
    buildJourneyEvent({
      journeyId,
      leadRecordId,
      eventName: 'lead_form_submit_success',
      occurredAtMs,
      recordedAtMs,
      actor: 'customer',
      clientEventId: input.clientEventId ?? createClientEventId('form'),
      discriminator: input.submissionId,
      payload: {
        metadata,
        normalized_phone: contact?.normalized_phone ?? null,
        normalized_email: contact?.normalized_email ?? null,
        vehicle,
        service,
        message,
        missing_info: normalizeStringList(input.missingInfo),
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
