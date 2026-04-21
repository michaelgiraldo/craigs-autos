import type { AttributionSnapshot } from './attribution.ts';
import type { CaptureChannel } from './lead-actions.ts';
import { normalizeWorkString } from './lead-followup-work.ts';

export type LeadSourceEvent = {
  source_event_id: string;
  source: CaptureChannel;
  occurred_at_ms: number;
  idempotency_key: string;
  journey_id: string | null;
  lead_record_id: string | null;
  contact_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  vehicle: string | null;
  service: string | null;
  message: string | null;
  locale: string | null;
  page_url: string | null;
  user_id: string | null;
  origin: string | null;
  site_label: string | null;
  attribution: AttributionSnapshot | null;
  metadata: Record<string, unknown>;
};

export type LeadSourceEventInput = {
  attribution: AttributionSnapshot | null;
  contactId?: string | null;
  email: string | null | undefined;
  idempotencyKey: string;
  journeyId?: string | null;
  leadRecordId?: string | null;
  locale: string | null | undefined;
  message: string | null | undefined;
  metadata?: Record<string, unknown>;
  name: string | null | undefined;
  occurredAtMs: number;
  origin: string | null | undefined;
  pageUrl: string | null | undefined;
  phone: string | null | undefined;
  service: string | null | undefined;
  siteLabel: string | null | undefined;
  source: CaptureChannel;
  sourceEventId: string;
  userId: string | null | undefined;
  vehicle: string | null | undefined;
};

export function createLeadSourceEvent(input: LeadSourceEventInput): LeadSourceEvent {
  return {
    source_event_id: input.sourceEventId,
    source: input.source,
    occurred_at_ms: input.occurredAtMs,
    idempotency_key: input.idempotencyKey,
    journey_id: input.journeyId ?? null,
    lead_record_id: input.leadRecordId ?? null,
    contact_id: input.contactId ?? null,
    name: normalizeWorkString(input.name),
    email: normalizeWorkString(input.email),
    phone: normalizeWorkString(input.phone),
    vehicle: normalizeWorkString(input.vehicle),
    service: normalizeWorkString(input.service),
    message: normalizeWorkString(input.message),
    locale: normalizeWorkString(input.locale),
    page_url: normalizeWorkString(input.pageUrl),
    user_id: normalizeWorkString(input.userId),
    origin: normalizeWorkString(input.origin),
    site_label: normalizeWorkString(input.siteLabel),
    attribution: input.attribution,
    metadata: input.metadata ?? {},
  };
}
