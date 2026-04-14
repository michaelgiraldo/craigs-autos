import type { AttributionSnapshot, LeadContact, LeadRecord } from '../domain/types.ts';

export type QualifiedLeadExportRecord = {
  lead_record_id: string;
  journey_id: string;
  contact_id: string | null;
  qualified_at_ms: number;
  capture_channel: LeadRecord['capture_channel'];
  source_platform: string | null;
  acquisition_class: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  landing_page: string | null;
  referrer_host: string | null;
  click_id_type: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  msclkid: string | null;
  fbclid: string | null;
  ttclid: string | null;
  normalized_phone: string | null;
  normalized_email: string | null;
};

function pickAttribution(attribution: AttributionSnapshot | null) {
  return {
    source_platform: attribution?.source_platform ?? null,
    acquisition_class: attribution?.acquisition_class ?? null,
    utm_source: attribution?.utm_source ?? null,
    utm_medium: attribution?.utm_medium ?? null,
    utm_campaign: attribution?.utm_campaign ?? null,
    utm_term: attribution?.utm_term ?? null,
    utm_content: attribution?.utm_content ?? null,
    landing_page: attribution?.landing_page ?? null,
    referrer_host: attribution?.referrer_host ?? null,
    click_id_type: attribution?.click_id_type ?? null,
    gclid: attribution?.gclid ?? null,
    gbraid: attribution?.gbraid ?? null,
    wbraid: attribution?.wbraid ?? null,
    msclkid: attribution?.msclkid ?? null,
    fbclid: attribution?.fbclid ?? null,
    ttclid: attribution?.ttclid ?? null,
  };
}

export function toQualifiedLeadExportRecord(args: {
  leadRecord: LeadRecord;
  contact: LeadContact | null;
}): QualifiedLeadExportRecord | null {
  const qualifiedAtMs = args.leadRecord.qualification.qualified_at_ms;
  if (!args.leadRecord.qualification.qualified || !qualifiedAtMs) return null;

  return {
    lead_record_id: args.leadRecord.lead_record_id,
    journey_id: args.leadRecord.journey_id,
    contact_id: args.leadRecord.contact_id,
    qualified_at_ms: qualifiedAtMs,
    capture_channel: args.leadRecord.capture_channel,
    normalized_phone: args.contact?.normalized_phone ?? null,
    normalized_email: args.contact?.normalized_email ?? null,
    ...pickAttribution(args.leadRecord.attribution),
  };
}
