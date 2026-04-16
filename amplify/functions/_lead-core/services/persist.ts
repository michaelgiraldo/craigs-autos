import { dedupeStrings } from '../domain/normalize.ts';
import type {
  Journey,
  JourneyBundle,
  JourneyEvent,
  LeadContact,
  LeadOutreachSnapshot,
  LeadRecord,
  LeadRecordStatus,
} from '../domain/types.ts';
import type { LeadCoreRepos } from '../repos/dynamo.ts';
import { applyJourneyStatusTransition, mergeLeadContacts } from './shared.ts';

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

function mergeLeadRecords(current: LeadRecord, incoming: LeadRecord): LeadRecord {
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

function mergeJourneys(current: Journey, incoming: Journey): Journey {
  const actionTypes = dedupeStrings([
    ...current.action_types,
    ...incoming.action_types,
  ]) as Journey['action_types'];
  const transition = applyJourneyStatusTransition({
    currentStatus: current.journey_status,
    currentReason: current.status_reason,
    incomingStatus: incoming.journey_status,
    incomingReason: incoming.status_reason,
  });
  return {
    ...current,
    lead_record_id: incoming.lead_record_id ?? current.lead_record_id,
    contact_id: incoming.contact_id ?? current.contact_id,
    journey_status: transition.journeyStatus ?? current.journey_status,
    status_reason: transition.statusReason,
    capture_channel: current.capture_channel ?? incoming.capture_channel,
    first_action: current.first_action ?? incoming.first_action,
    latest_action: incoming.latest_action ?? current.latest_action,
    action_types: actionTypes,
    action_count: Math.max(current.action_count, incoming.action_count, actionTypes.length),
    lead_user_id: current.lead_user_id ?? incoming.lead_user_id,
    thread_id: current.thread_id ?? incoming.thread_id,
    locale: current.locale ?? incoming.locale,
    page_url: current.page_url ?? incoming.page_url,
    page_path: current.page_path ?? incoming.page_path,
    origin: current.origin ?? incoming.origin,
    site_label: current.site_label ?? incoming.site_label,
    attribution: current.attribution ?? incoming.attribution,
    created_at_ms: Math.min(current.created_at_ms, incoming.created_at_ms),
    updated_at_ms: Math.max(current.updated_at_ms, incoming.updated_at_ms),
  };
}

async function findExistingContact(
  repos: LeadCoreRepos,
  contact: LeadContact,
): Promise<LeadContact | null> {
  if (contact.normalized_phone) {
    const byPhone = await repos.contacts.findByNormalizedPhone(contact.normalized_phone);
    if (byPhone) return byPhone;
  }
  if (contact.normalized_email) {
    const byEmail = await repos.contacts.findByNormalizedEmail(contact.normalized_email);
    if (byEmail) return byEmail;
  }
  return repos.contacts.getById(contact.contact_id);
}

export async function upsertLeadBundle(
  repos: LeadCoreRepos,
  bundle: JourneyBundle,
): Promise<JourneyBundle> {
  let persistedContact = bundle.contact;
  if (bundle.contact) {
    const existingContact = await findExistingContact(repos, bundle.contact);
    persistedContact = existingContact
      ? mergeLeadContacts(existingContact, bundle.contact)
      : bundle.contact;
    await repos.contacts.put(persistedContact);
  }

  let persistedLeadRecord = bundle.leadRecord;
  if (bundle.leadRecord) {
    const nextLeadRecord: LeadRecord = {
      ...bundle.leadRecord,
      contact_id: persistedContact?.contact_id ?? bundle.leadRecord.contact_id,
    };
    const existingLeadRecord = await repos.leadRecords.getById(nextLeadRecord.lead_record_id);
    persistedLeadRecord = existingLeadRecord
      ? mergeLeadRecords(existingLeadRecord, nextLeadRecord)
      : nextLeadRecord;
    await repos.leadRecords.put(persistedLeadRecord);
  }

  const nextJourney: Journey = {
    ...bundle.journey,
    lead_record_id: persistedLeadRecord?.lead_record_id ?? bundle.journey.lead_record_id,
    contact_id: persistedContact?.contact_id ?? bundle.journey.contact_id,
    capture_channel: persistedLeadRecord?.capture_channel ?? bundle.journey.capture_channel,
    journey_status:
      persistedLeadRecord?.status === 'qualified'
        ? 'qualified'
        : persistedLeadRecord
          ? 'captured'
          : bundle.journey.journey_status,
    first_action: persistedLeadRecord?.first_action ?? bundle.journey.first_action,
    latest_action: persistedLeadRecord?.latest_action ?? bundle.journey.latest_action,
    action_types: persistedLeadRecord?.action_types ?? bundle.journey.action_types,
    action_count: Math.max(
      bundle.journey.action_count,
      persistedLeadRecord?.action_count ?? 0,
      bundle.journey.action_types.length,
    ),
    updated_at_ms: Math.max(
      bundle.journey.updated_at_ms,
      persistedLeadRecord?.updated_at_ms ?? 0,
      persistedContact?.updated_at_ms ?? 0,
    ),
  };

  const existingJourney = await repos.journeys.getById(nextJourney.journey_id);
  const persistedJourney = existingJourney
    ? mergeJourneys(existingJourney, nextJourney)
    : nextJourney;
  await repos.journeys.put(persistedJourney);

  const persistedEvents: JourneyEvent[] = bundle.events.map((event) => ({
    ...event,
    lead_record_id: persistedLeadRecord?.lead_record_id ?? event.lead_record_id ?? null,
  }));
  await repos.journeyEvents.appendMany(persistedEvents);

  return {
    contact: persistedContact,
    journey: persistedJourney,
    leadRecord: persistedLeadRecord,
    events: persistedEvents,
  };
}
