import assert from 'node:assert/strict';
import test from 'node:test';
import type { S3Client } from '@aws-sdk/client-s3';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import { createLeadPhotoAttachmentLoader } from './lead-attachments.ts';

function makeS3(objects: Record<string, Buffer>): S3Client {
  return {
    send: async (command: unknown) => {
      const key = (command as { input?: { Key?: string } }).input?.Key ?? '';
      const value = objects[key];
      return {
        Body: value
          ? {
              transformToByteArray: async () => new Uint8Array(value),
            }
          : undefined,
      };
    },
  } as unknown as S3Client;
}

test('lead photo loader loads form S3 photos and ignores missing objects', async () => {
  const loader = createLeadPhotoAttachmentLoader({
    s3: makeS3({
      'form/client-event/photo-1/seat.jpg': Buffer.from([1, 2, 3, 4]),
    }),
  });

  const photos = await loader({
    attachments: [
      {
        attachment_id: 'photo-1',
        byte_size: 4,
        content_type: 'image/jpeg',
        disposition: 'customer_photo',
        filename: 'seat.jpg',
        source: 'form',
        status: 'supported',
        storage: {
          kind: 's3',
          bucket: 'lead-attachments',
          key: 'form/client-event/photo-1/seat.jpg',
        },
      },
      {
        attachment_id: 'photo-2',
        byte_size: 4,
        content_type: 'image/png',
        disposition: 'customer_photo',
        filename: 'missing.png',
        source: 'form',
        status: 'supported',
        storage: {
          kind: 's3',
          bucket: 'lead-attachments',
          key: 'form/client-event/photo-2/missing.png',
        },
      },
    ],
  } as LeadFollowupWorkItem);

  assert.equal(photos.length, 1);
  assert.equal(photos[0]?.filename, 'seat.jpg');
  assert.equal(photos[0]?.contentType, 'image/jpeg');
  assert.equal(photos[0]?.dataUrl, 'data:image/jpeg;base64,AQIDBA==');
});

test('lead photo loader parses email raw MIME through shared image limits', async () => {
  const rawMime = [
    'From: Customer <customer@example.com>',
    'To: contact@craigs.autos',
    'Subject: Photos',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="boundary-1"',
    '',
    '--boundary-1',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    'Please see attached.',
    '--boundary-1',
    'Content-Type: image/webp; name="seat.webp"',
    'Content-Disposition: attachment; filename="seat.webp"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from([5, 6, 7, 8]).toString('base64'),
    '--boundary-1',
    'Content-Type: application/pdf; name="invoice.pdf"',
    'Content-Disposition: attachment; filename="invoice.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from('pdf').toString('base64'),
    '--boundary-1--',
    '',
  ].join('\r\n');
  const loader = createLeadPhotoAttachmentLoader({
    s3: makeS3({ 'raw/message.eml': Buffer.from(rawMime) }),
  });

  const photos = await loader({
    inbound_email_s3_bucket: 'email-bucket',
    inbound_email_s3_key: 'raw/message.eml',
  } as LeadFollowupWorkItem);

  assert.equal(photos.length, 1);
  assert.equal(photos[0]?.filename, 'seat.webp');
  assert.equal(photos[0]?.contentType, 'image/webp');
  assert.equal(photos[0]?.dataUrl, 'data:image/webp;base64,BQYHCA==');
});
