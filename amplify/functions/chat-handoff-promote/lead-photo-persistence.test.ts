import assert from 'node:assert/strict';
import test from 'node:test';
import type { PutObjectCommandInput, S3Client } from '@aws-sdk/client-s3';
import type { LeadAttachment } from '../_lead-platform/domain/lead-attachment.ts';
import { persistChatLeadPhotoAttachments } from './lead-photo-persistence.ts';

function makeChatAttachment(overrides: Partial<LeadAttachment> = {}): LeadAttachment {
  return {
    attachment_id: 'chat-photo-1',
    byte_size: 0,
    content_type: 'image/jpeg',
    disposition: 'customer_photo',
    filename: 'IMG_7527.jpeg',
    source: 'chat',
    status: 'supported',
    storage: {
      kind: 'chatkit',
      id: 'cfile_123',
      url: 'https://example.test/photo.jpg',
    },
    ...overrides,
  };
}

function makeS3(writes: PutObjectCommandInput[]): S3Client {
  return {
    send: async (command: unknown) => {
      writes.push((command as { input: PutObjectCommandInput }).input);
      return {};
    },
  } as unknown as S3Client;
}

test('persistChatLeadPhotoAttachments stores ChatKit photos in transient S3', async () => {
  const writes: PutObjectCommandInput[] = [];
  const result = await persistChatLeadPhotoAttachments({
    attachments: [makeChatAttachment()],
    bucketName: 'lead-attachments',
    fetchFile: async () =>
      new Response(Buffer.from([1, 2, 3, 4]), {
        headers: {
          'content-length': '4',
          'content-type': 'image/jpeg',
        },
        status: 200,
      }),
    s3: makeS3(writes),
    threadId: 'cthr_abc123',
  });

  assert.equal(result.loadedPhotoCount, 1);
  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0]?.byte_size, 4);
  assert.equal(result.attachments[0]?.source, 'chat');
  assert.deepEqual(result.attachments[0]?.storage, {
    kind: 's3',
    bucket: 'lead-attachments',
    key: 'chat/cthr_abc123/chat-photo-1/IMG_7527.jpeg',
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.Bucket, 'lead-attachments');
  assert.equal(writes[0]?.ContentType, 'image/jpeg');
  assert.equal(writes[0]?.Metadata?.source, 'chat');
});

test('persistChatLeadPhotoAttachments preserves references when download fails', async () => {
  const original = makeChatAttachment();
  const originalConsoleError = console.error;
  console.error = () => {};
  let result: Awaited<ReturnType<typeof persistChatLeadPhotoAttachments>>;
  try {
    result = await persistChatLeadPhotoAttachments({
      attachments: [original],
      bucketName: 'lead-attachments',
      fetchFile: async () => new Response(null, { status: 403 }),
      s3: makeS3([]),
      threadId: 'cthr_abc123',
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(result.loadedPhotoCount, 0);
  assert.deepEqual(result.attachments, [original]);
});
