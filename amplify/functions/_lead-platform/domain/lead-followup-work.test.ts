import assert from 'node:assert/strict';
import test from 'node:test';
import { createLeadFollowupWorkItem, LEAD_FOLLOWUP_WORK_TTL_DAYS } from './lead-followup-work.ts';
import type { LeadAttachment } from './lead-attachment.ts';

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
  assert.equal(record.lead_notification_status, null);
  assert.equal(record.customer_language, '');
  assert.deepEqual(record.attachments, []);
  assert.equal(record.attachment_count, 0);
  assert.equal(record.photo_attachment_count, 0);
});

test('createLeadFollowupWorkItem stores a generic attachment manifest', () => {
  const attachments: LeadAttachment[] = [
    {
      attachment_id: 'attachment-1',
      byte_size: 1024,
      content_type: 'image/jpeg',
      disposition: 'customer_photo',
      filename: 'seat.jpg',
      source: 'form',
      status: 'supported',
      storage: {
        kind: 's3',
        bucket: 'photo-bucket',
        key: 'form/form_123/attachment-1/seat.jpg',
      },
    },
  ];

  const record = createLeadFollowupWorkItem({
    followupWorkId: 'quote-request-2',
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
    customerLanguage: 'Spanish',
    pageUrl: 'https://craigs.autos/en/request-a-quote',
    userId: 'anon-user',
    attribution: null,
    attachments,
    attachmentCount: 2,
    photoAttachmentCount: 1,
    unsupportedAttachmentCount: 1,
  });

  assert.deepEqual(record.attachments, attachments);
  assert.equal(record.attachment_count, 2);
  assert.equal(record.photo_attachment_count, 1);
  assert.equal(record.unsupported_attachment_count, 1);
  assert.equal(record.customer_language, 'Spanish');
});
