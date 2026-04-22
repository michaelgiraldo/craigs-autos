import assert from 'node:assert/strict';
import test from 'node:test';
import { createS3FormAttachmentResolver } from './attachments.ts';

test('createS3FormAttachmentResolver validates uploaded form photo metadata', async () => {
  const sent: unknown[] = [];
  const resolver = createS3FormAttachmentResolver({
    bucketName: 'photo-bucket',
    s3: {
      send: async (command: unknown) => {
        sent.push(command);
        return {
          ContentLength: 1024,
          ContentType: 'image/jpeg',
          Metadata: {
            'attachment-id': 'attachment-1',
            'client-event-id': 'form_123',
          },
        };
      },
    } as never,
  });

  const result = await resolver({
    attachments: [
      {
        attachmentId: 'attachment-1',
        byteSize: 1024,
        contentType: 'image/jpeg',
        filename: 'seat.jpg',
        key: 'form/form_123/attachment-1/seat.jpg',
      },
    ],
    clientEventId: 'form_123',
    unsupportedAttachmentCount: 1,
  });

  assert.equal(sent.length, 1);
  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0]?.storage.kind, 's3');
  assert.equal(result.unsupportedAttachmentCount, 1);
});

test('createS3FormAttachmentResolver marks mismatched uploads unsupported without throwing', async () => {
  const resolver = createS3FormAttachmentResolver({
    bucketName: 'photo-bucket',
    s3: {
      send: async () => ({
        ContentLength: 2048,
        ContentType: 'image/png',
        Metadata: {
          'attachment-id': 'different',
          'client-event-id': 'form_123',
        },
      }),
    } as never,
  });

  const result = await resolver({
    attachments: [
      {
        attachmentId: 'attachment-1',
        byteSize: 1024,
        contentType: 'image/jpeg',
        filename: 'seat.jpg',
        key: 'form/form_123/attachment-1/seat.jpg',
      },
    ],
    clientEventId: 'form_123',
    unsupportedAttachmentCount: 0,
  });

  assert.equal(result.attachments.length, 0);
  assert.equal(result.unsupportedAttachmentCount, 1);
});
