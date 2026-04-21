import assert from 'node:assert/strict';
import test from 'node:test';
import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';
import type { LeadFollowupWorkItem } from '../domain/lead-followup-work.ts';
import type { LeadContact } from '../domain/contact.ts';
import type { Journey } from '../domain/journey.ts';
import type { JourneyEvent } from '../domain/journey-event.ts';
import type { LeadRecord } from '../domain/lead-record.ts';
import { applyLeadFollowupWorkerToLeadRecord } from './followup-work.ts';

function makeQuoteRecord(overrides: Partial<LeadFollowupWorkItem> = {}): LeadFollowupWorkItem {
  return {
    followup_work_id: 'quote-request-1',
    idempotency_key: 'form:quote-request-1',
    source_event_id: 'quote-request-1',
    status: 'completed',
    created_at: 1_000,
    updated_at: 2_000,
    ttl: 999_999,
    name: 'Michael',
    email: 'michael@example.com',
    phone: '(408) 555-0101',
    vehicle: '2018 Toyota Camry',
    service: 'seat-repair',
    message: 'Driver seat tear',
    capture_channel: 'form',
    origin: 'https://example.test/contact',
    site_label: 'example.test',
    journey_id: 'journey-1',
    lead_record_id: 'lead-record-1',
    contact_id: 'contact-1',
    locale: 'en',
    page_url: 'https://example.test/contact',
    user_id: 'anon-user',
    attribution: null,
    ai_status: null,
    ai_model: '',
    ai_error: '',
    sms_body: '',
    email_subject: '',
    email_body: '',
    missing_info: [],
    sms_status: 'sent',
    sms_message_id: 'sms-123',
    sms_error: '',
    email_status: 'skipped',
    customer_email_message_id: '',
    customer_email_error: '',
    outreach_channel: 'sms',
    outreach_result: 'sms_sent',
    owner_email_status: 'sent',
    owner_email_message_id: 'owner-123',
    owner_email_error: '',
    ...overrides,
  };
}

test('applyLeadFollowupWorkerToLeadRecord updates the existing lead record without recreating form-submit events', async () => {
  const contact: LeadContact = {
    contact_id: 'contact-1',
    normalized_phone: '+14085550101',
    normalized_email: 'michael@example.com',
    first_name: 'Michael',
    last_name: null,
    display_name: 'Michael',
    raw_phone: '(408) 555-0101',
    raw_email: 'michael@example.com',
    quo_contact_id: null,
    quo_tags: ['Form Lead'],
    created_at_ms: 1_000,
    updated_at_ms: 1_000,
  };
  const journey: Journey = {
    journey_id: 'journey-1',
    lead_record_id: 'lead-record-1',
    contact_id: 'contact-1',
    journey_status: 'captured',
    status_reason: null,
    capture_channel: 'form',
    first_action: 'form_submit',
    latest_action: 'form_submit',
    action_types: ['form_submit'],
    action_count: 1,
    lead_user_id: 'anon-user',
    thread_id: null,
    locale: 'en',
    page_url: 'https://example.test/contact',
    page_path: '/contact',
    origin: 'https://example.test/contact',
    site_label: 'example.test',
    attribution: null,
    created_at_ms: 1_000,
    updated_at_ms: 1_000,
  };
  const leadRecord: LeadRecord = {
    lead_record_id: 'lead-record-1',
    journey_id: 'journey-1',
    contact_id: 'contact-1',
    status: 'ready_for_outreach',
    capture_channel: 'form',
    title: 'Michael - seat-repair',
    vehicle: '2018 Toyota Camry',
    service: 'seat-repair',
    project_summary: 'Driver seat tear',
    customer_message: 'Driver seat tear',
    customer_language: null,
    attribution: null,
    latest_outreach: {
      channel: null,
      status: 'not_attempted',
      provider: null,
      external_id: null,
      error: null,
      sent_at_ms: null,
    },
    qualification: {
      qualified: false,
      qualified_at_ms: null,
    },
    first_action: 'form_submit',
    latest_action: 'form_submit',
    action_types: ['form_submit'],
    action_count: 1,
    created_at_ms: 1_000,
    updated_at_ms: 1_000,
  };

  const appended: JourneyEvent[] = [];
  let persistedLeadRecord: LeadRecord | null = null;

  await applyLeadFollowupWorkerToLeadRecord({
    repos: {
      contacts: {
        getById: async () => contact,
        findByNormalizedPhone: async () => contact,
        findByNormalizedEmail: async () => contact,
        findByQuoContactId: async () => null,
        put: async () => undefined,
      },
      journeys: {
        getById: async () => journey,
        put: async () => undefined,
      },
      leadRecords: {
        getById: async () => leadRecord,
        listByContactId: async () => [],
        listByStatus: async () => [],
        listPage: async () => ({ items: [] }),
        put: async (next: LeadRecord) => {
          persistedLeadRecord = next;
        },
      },
      journeyEvents: {
        getBySortKey: async () => null,
        append: async (event: JourneyEvent) => {
          appended.push(event);
        },
        appendMany: async (events: JourneyEvent[]) => {
          appended.push(...events);
        },
        listByJourneyId: async () => [],
        listByLeadRecordId: async () => [],
        scanPage: async () => ({ items: [] }),
      },
    } as never,
    record: makeQuoteRecord(),
    quoConfig: {
      apiKey: '',
      leadTagsFieldKey: null,
      leadTagsFieldName: null,
      source: null,
      externalIdPrefix: null,
    },
  });

  const syncedLeadRecord = persistedLeadRecord as LeadRecord | null;
  assert.ok(syncedLeadRecord);
  assert.equal(syncedLeadRecord.lead_record_id, 'lead-record-1');
  assert.equal(syncedLeadRecord.latest_outreach.status, 'sent');
  assert.equal(
    appended.some((event) => event.event_name === LEAD_EVENTS.formSubmitSuccess),
    false,
  );
  assert.deepEqual(
    appended.map((event) => event.event_name),
    [LEAD_EVENTS.outreachSmsSent],
  );
});
