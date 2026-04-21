import assert from 'node:assert/strict';
import test from 'node:test';
import { createLeadFollowupWorkItem, LEAD_FOLLOWUP_WORK_TTL_DAYS } from './lead-followup-work.ts';

test('createLeadFollowupWorkItem creates a queued request with canonical lead linkage', () => {
  const record = createLeadFollowupWorkItem({
    followupWorkId: 'quote-request-1',
    captureChannel: 'form',
    nowEpochSeconds: 1_000,
    name: 'Michael',
    email: 'michael@example.com',
    phone: '(408) 555-0101',
    vehicle: '1967 Mustang',
    service: 'classic-interior',
    message: 'Driver seat needs work.',
    origin: 'https://craigs.autos/en/request-a-quote',
    siteLabel: 'craigs.autos',
    journeyId: 'journey-1',
    leadRecordId: 'lead-record-1',
    contactId: 'contact-1',
    locale: 'en',
    pageUrl: 'https://craigs.autos/en/request-a-quote',
    userId: 'anon-user',
    attribution: null,
  });

  assert.equal(record.status, 'queued');
  assert.equal(record.journey_id, 'journey-1');
  assert.equal(record.lead_record_id, 'lead-record-1');
  assert.equal(record.contact_id, 'contact-1');
  assert.equal(record.ttl, 1_000 + LEAD_FOLLOWUP_WORK_TTL_DAYS * 24 * 60 * 60);
  assert.equal(record.sms_status, null);
  assert.equal(record.email_status, null);
  assert.equal(record.owner_email_status, null);
});
