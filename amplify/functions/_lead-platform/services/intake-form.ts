import {
  createClientEventId,
  createStableJourneyId,
  createStableLeadRecordId,
} from '../domain/ids.ts';
import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';
import {
  buildLeadTitle,
  normalizeLocale,
  normalizeStringList,
  trimToNull,
} from '../domain/normalize.ts';
import type { AttributionSnapshot } from '../domain/attribution.ts';
import type { CustomerAction } from '../domain/lead-actions.ts';
import type { JourneyBundle } from '../domain/lead-bundle.ts';
import { createLeadSummary, type LeadSummary } from '../domain/lead-summary.ts';
import type { Journey, JourneyMetadata } from '../domain/journey.ts';
import type { LeadOutreachSnapshot, LeadQualificationSnapshot } from '../domain/lead-record.ts';
import { buildLeadContact } from './contact-identity.ts';
import { buildJourneyEvent } from './journey-events.ts';
import { createDefaultOutreachSnapshot, deriveLeadRecordStatus } from './outreach.ts';
import { buildDefaultQualificationSnapshot } from './qualification.ts';

export type FormLeadIntakeInput = {
  quoteRequestId: string;
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
  photoAttachmentCount?: number;
  attribution?: AttributionSnapshot | null;
  origin?: string | null;
  siteLabel?: string | null;
  unsupportedAttachmentCount?: number;
  leadSummary?: LeadSummary | null;
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
    fallbackKind: 'quote_request',
    fallbackValue: input.quoteRequestId,
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
  const leadSummary =
    input.leadSummary ??
    createLeadSummary({
      captureChannel: 'form',
      customerName: input.name,
      customerEmail: input.email,
      customerPhone: input.phone,
      customerLanguage: metadata.locale,
      vehicle,
      service,
      projectSummary: message,
      customerMessage: message,
      knownFacts: [vehicle, service].filter(Boolean),
      missingInfo: input.missingInfo,
      recommendedNextSteps: ['Respond to the quote request and ask for missing project details.'],
      alreadyAskedQuestions: [],
      photoReferenceCount: input.photoAttachmentCount ?? 0,
      loadedPhotoCount: 0,
      unsupportedAttachmentCount: input.unsupportedAttachmentCount ?? 0,
      customerResponsePolicy: 'automatic',
      customerResponsePolicyReason: 'form_submission_valid',
    });
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
    customer_language: metadata.locale,
    lead_summary: leadSummary,
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
      eventName: LEAD_EVENTS.formSubmitSuccess,
      occurredAtMs,
      recordedAtMs,
      actor: 'customer',
      clientEventId: input.clientEventId ?? createClientEventId('form'),
      discriminator: input.quoteRequestId,
      payload: {
        metadata,
        normalized_phone: contact?.normalized_phone ?? null,
        normalized_email: contact?.normalized_email ?? null,
        vehicle,
        service,
        message,
        photo_attachment_count: input.photoAttachmentCount ?? 0,
        unsupported_attachment_count: input.unsupportedAttachmentCount ?? 0,
        lead_summary: leadSummary,
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
