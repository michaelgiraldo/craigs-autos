import assert from 'node:assert/strict';
import test from 'node:test';
import type { LeadContact } from '../domain/contact.ts';
import type { LeadContactObservation } from '../domain/contact-observation.ts';
import type { LeadContactPoint } from '../domain/contact-point.ts';
import type { LeadRecord } from '../domain/lead-record.ts';
import type { Journey } from '../domain/journey.ts';
import type { JourneyEvent } from '../domain/journey-event.ts';
import type { LeadPlatformRepos } from '../repos/dynamo.ts';
import { buildFormLeadBundle } from './intake-form.ts';
import { upsertLeadBundle } from './persist.ts';

function makeContact(contactId: string, overrides: Partial<LeadContact> = {}): LeadContact {
  return {
    contact_id: contactId,
    normalized_phone: null,
    normalized_email: null,
    primary_phone_contact_point_id: null,
    primary_email_contact_point_id: null,
    first_name: null,
    last_name: null,
    display_name: null,
    display_name_confidence: null,
    display_name_source_channel: null,
    display_name_source_method: null,
    raw_phone: null,
    raw_email: null,
    created_at_ms: 1_000,
    updated_at_ms: 1_000,
    ...overrides,
  };
}

test('upsertLeadBundle chooses phone contact on phone/email identity conflict', async () => {
  const phoneContact = makeContact('contact-phone', {
    normalized_phone: '+14085550100',
    display_name: 'Phone Person',
  });
  const emailContact = makeContact('contact-email', {
    normalized_email: 'person@example.com',
    display_name: 'Email Person',
  });
  const savedContacts: LeadContact[] = [];
  const savedPoints: LeadContactPoint[] = [];
  const savedObservations: LeadContactObservation[] = [];
  const savedLeadRecords: LeadRecord[] = [];
  const savedJourneys: Journey[] = [];
  const savedEvents: JourneyEvent[] = [];

  const repos: LeadPlatformRepos = {
    contacts: {
      findByNormalizedEmail: async () => emailContact,
      findByNormalizedPhone: async () => phoneContact,
      getById: async () => null,
      put: async (contact) => {
        savedContacts.push(contact);
      },
    },
    contactObservations: {
      append: async (observation) => {
        savedObservations.push(observation);
      },
      appendMany: async (observations) => {
        savedObservations.push(...observations);
      },
      listByContactId: async () => [],
    },
    contactPoints: {
      findByNormalizedValue: async () => null,
      getById: async () => null,
      listByContactId: async () => [],
      put: async (point) => {
        savedPoints.push(point);
      },
    },
    providerContactProjections: {
      findByProviderExternalId: async () => null,
      getById: async () => null,
      listByContactId: async () => [],
      put: async () => undefined,
    },
    journeys: {
      getById: async () => null,
      listPage: async () => ({ items: [] }),
      put: async (journey) => {
        savedJourneys.push(journey);
      },
    },
    journeyEvents: {
      append: async (event) => {
        savedEvents.push(event);
      },
      appendMany: async (events) => {
        savedEvents.push(...events);
      },
      getBySortKey: async () => null,
      listByJourneyId: async () => [],
      listByLeadRecordId: async () => [],
      scanPage: async () => ({ items: [] }),
    },
    leadRecords: {
      getById: async () => null,
      listByContactId: async () => [],
      listByStatus: async () => [],
      listPage: async () => ({ items: [] }),
      put: async (record) => {
        savedLeadRecords.push(record);
      },
    },
    followupWork: {
      acquireLease: async () => false,
      getByIdempotencyKey: async () => null,
      listByStatus: async () => [],
      put: async () => undefined,
      putIfAbsent: async () => true,
      updateFailureAlertState: async () => true,
    },
    conversionDecisions: {
      getById: async () => null,
      listByLeadRecordId: async () => [],
      put: async () => undefined,
    },
    conversionFeedbackOutbox: {
      acquireLease: async () => null,
      getById: async () => null,
      listByDecisionId: async () => [],
      listByLeadRecordId: async () => [],
      listByStatus: async () => [],
      put: async () => undefined,
    },
    conversionFeedbackOutcomes: {
      append: async () => undefined,
      listByLeadRecordId: async () => [],
      listByOutboxId: async () => [],
    },
    providerConversionDestinations: {
      getByKey: async () => null,
      listEnabled: async () => [],
      put: async () => undefined,
    },
  };

  const bundle = buildFormLeadBundle({
    quoteRequestId: 'quote-conflict',
    occurredAt: 3_000,
    name: 'Full Person',
    phone: '(408) 555-0100',
    email: 'person@example.com',
  });
  const persisted = await upsertLeadBundle(repos, bundle);

  assert.equal(persisted.contact?.contact_id, 'contact-phone');
  assert.equal(savedContacts[0]?.contact_id, 'contact-phone');
  assert.equal(savedLeadRecords[0]?.contact_id, 'contact-phone');
  assert.equal(savedJourneys[0]?.contact_id, 'contact-phone');
  assert.equal(
    savedPoints.every((point) => point.contact_id === 'contact-phone'),
    true,
  );
  assert.equal(
    savedObservations.some((observation) => observation.kind === 'identity_conflict'),
    true,
  );
});
