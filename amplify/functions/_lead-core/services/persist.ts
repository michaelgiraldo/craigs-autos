import type { JourneyBundle } from '../domain/lead-bundle.ts';
import type { Journey } from '../domain/journey.ts';
import type { JourneyEvent } from '../domain/journey-event.ts';
import type { LeadRecord } from '../domain/lead-record.ts';
import type { LeadCoreRepos } from '../repos/dynamo.ts';
import { findExistingContact } from './contact-resolver.ts';
import { mergeLeadContacts } from './contact-identity.ts';
import { mergeJourneys } from './merge-journey.ts';
import { mergeLeadRecords } from './merge-lead-record.ts';

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
