import type { LeadOutreachSnapshot, LeadRecord, LeadRecordStatus } from '../domain/lead-record.ts';
import { dedupeStrings } from '../domain/normalize.ts';

function scoreLeadRecordStatus(status: LeadRecordStatus): number {
  switch (status) {
    case 'qualified':
      return 6;
    case 'outreach_sent':
      return 5;
    case 'awaiting_customer':
      return 4;
    case 'ready_for_outreach':
      return 3;
    case 'new':
      return 2;
    case 'archived':
      return 1;
    case 'error':
      return 0;
  }
}

function scoreOutreach(snapshot: LeadOutreachSnapshot): number {
  switch (snapshot.status) {
    case 'sent':
      return 4;
    case 'failed':
      return 3;
    case 'skipped':
      return 2;
    case 'not_attempted':
      return 1;
  }
}

function chooseLonger(current: string | null, incoming: string | null): string | null {
  if (!current) return incoming;
  if (!incoming) return current;
  return incoming.length > current.length ? incoming : current;
}

export function mergeLeadRecords(current: LeadRecord, incoming: LeadRecord): LeadRecord {
  const actionTypes = dedupeStrings([
    ...current.action_types,
    ...incoming.action_types,
  ]) as LeadRecord['action_types'];

  return {
    ...current,
    journey_id: current.journey_id || incoming.journey_id,
    contact_id: current.contact_id ?? incoming.contact_id,
    status:
      scoreLeadRecordStatus(incoming.status) > scoreLeadRecordStatus(current.status)
        ? incoming.status
        : current.status,
    capture_channel: current.capture_channel ?? incoming.capture_channel,
    title: current.title.length >= incoming.title.length ? current.title : incoming.title,
    vehicle: current.vehicle ?? incoming.vehicle,
    service: current.service ?? incoming.service,
    project_summary: chooseLonger(current.project_summary, incoming.project_summary),
    customer_message: chooseLonger(current.customer_message, incoming.customer_message),
    customer_language: current.customer_language ?? incoming.customer_language,
    attribution: current.attribution ?? incoming.attribution,
    latest_outreach:
      scoreOutreach(incoming.latest_outreach) > scoreOutreach(current.latest_outreach)
        ? incoming.latest_outreach
        : current.latest_outreach,
    qualification: {
      qualified: current.qualification.qualified || incoming.qualification.qualified,
      qualified_at_ms:
        current.qualification.qualified_at_ms ?? incoming.qualification.qualified_at_ms,
      uploaded_google_ads:
        current.qualification.uploaded_google_ads || incoming.qualification.uploaded_google_ads,
      uploaded_google_ads_at_ms:
        current.qualification.uploaded_google_ads_at_ms ??
        incoming.qualification.uploaded_google_ads_at_ms,
    },
    first_action: current.first_action ?? incoming.first_action,
    latest_action: incoming.latest_action ?? current.latest_action,
    action_types: actionTypes,
    action_count: Math.max(current.action_count, incoming.action_count, actionTypes.length),
    created_at_ms: Math.min(current.created_at_ms, incoming.created_at_ms),
    updated_at_ms: Math.max(current.updated_at_ms, incoming.updated_at_ms),
  };
}
