import { createHash } from 'node:crypto';
import { createStableJourneyId, createStableLeadRecordId } from '../domain/ids.ts';
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

export type EmailLeadIntakeInput = {
  emailIntakeId: string;
  threadKey: string;
  messageId: string;
  occurredAt: number;
  clientEventId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  vehicle?: string | null;
  service?: string | null;
  projectSummary?: string | null;
  customerMessage?: string | null;
  customerLanguage?: string | null;
  subject?: string | null;
  originalRecipient?: string | null;
  routeStatus?: string | null;
  photoAttachmentCount?: number;
  unsupportedAttachmentCount?: number;
  locale?: string | null;
  attribution?: AttributionSnapshot | null;
  siteLabel?: string | null;
  latestOutreach?: LeadOutreachSnapshot;
  qualification?: Partial<LeadQualificationSnapshot>;
  missingInfo?: string[];
  leadSummary?: LeadSummary | null;
};

function createStableEmailIntakeClientEventId(input: EmailLeadIntakeInput): string {
  const source =
    trimToNull(input.messageId, 300) ??
    trimToNull(input.emailIntakeId, 300) ??
    trimToNull(input.threadKey, 300) ??
    'unknown';
  const digest = createHash('sha256').update(source).digest('hex').slice(0, 24);
  return `email_intake_${digest}`;
}

export function buildEmailLeadBundle(input: EmailLeadIntakeInput): JourneyBundle {
  const occurredAtMs = input.occurredAt;
  const recordedAtMs = occurredAtMs;
  const journeyId = createStableJourneyId({
    providedJourneyId: null,
    fallbackKind: 'email_thread',
    fallbackValue: input.threadKey,
  });
  const leadRecordId = createStableLeadRecordId({
    sourceKind: 'journey',
    sourceValue: journeyId,
  });

  const metadata: JourneyMetadata = {
    lead_user_id: null,
    thread_id: trimToNull(input.threadKey, 160),
    locale: normalizeLocale(input.locale),
    page_url: null,
    page_path: null,
    origin: trimToNull(input.originalRecipient, 500),
    site_label: trimToNull(input.siteLabel, 120),
    attribution: input.attribution ?? null,
  };

  const contact = buildLeadContact({
    name: input.name,
    phone: input.phone,
    email: input.email,
    quoTags: ['Email Lead'],
    createdAtMs: occurredAtMs,
  });

  const latestOutreach = input.latestOutreach ?? createDefaultOutreachSnapshot();
  const qualification = buildDefaultQualificationSnapshot(input.qualification);
  const vehicle = trimToNull(input.vehicle, 160);
  const service = trimToNull(input.service, 120);
  const projectSummary = trimToNull(input.projectSummary, 4_000);
  const customerMessage = trimToNull(input.customerMessage, 4_000);
  const leadSummary =
    input.leadSummary ??
    createLeadSummary({
      captureChannel: 'email',
      customerName: input.name,
      customerEmail: input.email,
      customerPhone: input.phone,
      customerLanguage: input.customerLanguage,
      vehicle,
      service,
      projectSummary: projectSummary ?? customerMessage,
      customerMessage,
      knownFacts: [vehicle, service, projectSummary].filter(Boolean),
      missingInfo: input.missingInfo,
      recommendedNextSteps: ['Reply to the customer email with the next useful step.'],
      alreadyAskedQuestions: [],
      photoReferenceCount: input.photoAttachmentCount ?? 0,
      loadedPhotoCount: input.photoAttachmentCount ?? 0,
      unsupportedAttachmentCount: input.unsupportedAttachmentCount ?? 0,
      customerResponsePolicy: 'automatic',
      customerResponsePolicyReason: 'email_triage_accepted',
    });
  const actionTypes: CustomerAction[] = ['email_received'];

  const journey: Journey = {
    journey_id: journeyId,
    lead_record_id: leadRecordId,
    contact_id: contact?.contact_id ?? null,
    journey_status: 'captured',
    status_reason:
      leadSummary.customer_response_policy === 'manual_review'
        ? 'email_intake_manual_review'
        : 'email_intake_accepted',
    capture_channel: 'email',
    first_action: 'email_received',
    latest_action: 'email_received',
    action_types: [...actionTypes],
    action_count: 1,
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
    capture_channel: 'email' as const,
    title: buildLeadTitle({
      channel: 'email',
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
    lead_summary: leadSummary,
    attribution: input.attribution ?? null,
    latest_outreach: latestOutreach,
    qualification,
    first_action: 'email_received' as const,
    latest_action: 'email_received' as const,
    action_types: [...actionTypes],
    action_count: 1,
    created_at_ms: occurredAtMs,
    updated_at_ms: occurredAtMs,
  };

  const events = [
    buildJourneyEvent({
      journeyId,
      leadRecordId,
      eventName: LEAD_EVENTS.emailIntakeAccepted,
      occurredAtMs,
      recordedAtMs,
      actor: 'customer',
      clientEventId: input.clientEventId ?? createStableEmailIntakeClientEventId(input),
      discriminator: input.messageId || input.emailIntakeId,
      payload: {
        metadata,
        message_id: trimToNull(input.messageId, 300),
        subject: trimToNull(input.subject, 300),
        route_status: trimToNull(input.routeStatus, 120),
        normalized_phone: contact?.normalized_phone ?? null,
        normalized_email: contact?.normalized_email ?? null,
        vehicle,
        service,
        project_summary: projectSummary,
        customer_message: customerMessage,
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
