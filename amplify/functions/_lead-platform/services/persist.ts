import type { JourneyBundle } from '../domain/lead-bundle.ts';
import type { Journey } from '../domain/journey.ts';
import type { JourneyEvent } from '../domain/journey-event.ts';
import type { LeadRecord } from '../domain/lead-record.ts';
import type { LeadPlatformRepos } from '../repos/dynamo.ts';
import { resolveLeadContactIdentity } from './contact-resolver.ts';
import { mergeLeadContacts } from './contact-identity.ts';
import { mergeJourneys } from './merge-journey.ts';
import { mergeLeadRecords } from './merge-lead-record.ts';

function contactEvidenceChannel(channel: string): 'form' | 'email' | 'chat' | 'admin' | 'provider' {
  return channel === 'form' || channel === 'email' || channel === 'chat' ? channel : 'provider';
}

export async function upsertLeadBundle(
  repos: LeadPlatformRepos,
  bundle: JourneyBundle,
): Promise<JourneyBundle> {
  let persistedContact = bundle.contact;
  if (bundle.contact) {
    const sourceEvent = bundle.events[0] ?? null;
    const resolved = await resolveLeadContactIdentity({
      repos,
      identity: {
        contact: bundle.contact,
        contactObservations: bundle.contactObservations ?? [],
        contactPoints: bundle.contactPoints ?? [],
      },
      sourceChannel: contactEvidenceChannel(
        bundle.leadRecord?.capture_channel ?? bundle.journey.capture_channel ?? 'provider',
      ),
      sourceMethod: 'system',
      sourceEventId: sourceEvent?.journey_event_id ?? sourceEvent?.client_event_id ?? null,
      occurredAtMs: bundle.journey.created_at_ms,
    });
    const existingContact = resolved.selectedContact;
    persistedContact = existingContact
      ? mergeLeadContacts(existingContact, resolved.identity.contact ?? bundle.contact)
      : (resolved.identity.contact ?? bundle.contact);
    await repos.contacts.put(persistedContact);
    await Promise.all(
      resolved.identity.contactPoints.map((point) =>
        repos.contactPoints.put({
          ...point,
          contact_id: persistedContact?.contact_id ?? point.contact_id,
        }),
      ),
    );
    await repos.contactObservations.appendMany(
      resolved.identity.contactObservations.map((observation) => ({
        ...observation,
        contact_id: persistedContact?.contact_id ?? observation.contact_id,
      })),
    );
  }

  await Promise.all(
    (bundle.providerContactProjections ?? []).map((projection) =>
      repos.providerContactProjections.put(projection),
    ),
  );

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
