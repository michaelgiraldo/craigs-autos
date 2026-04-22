import assert from 'node:assert/strict';
import test from 'node:test';
import { createLeadAttachmentUploadStartHandler } from './handler.ts';

function post(body: unknown) {
  return {
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify(body),
  };
}

test('lead attachment upload start rejects invalid payloads', async () => {
  const handler = createLeadAttachmentUploadStartHandler({
    configValid: true,
    createUploadTarget: async () => {
      throw new Error('should not create upload target');
    },
  });

  const result = await handler(post({ client_event_id: '', files: [] }));
  assert.equal(result.statusCode, 400);
});

test('lead attachment upload start skips unsupported files and returns upload targets', async () => {
  const uploadTargetArgs: Array<{
    attachmentId: string;
    byteSize: number;
    clientEventId: string;
    contentType: string;
    filename: string;
    key: string;
  }> = [];
  const handler = createLeadAttachmentUploadStartHandler({
    configValid: true,
    createUploadTarget: async (args) => {
      uploadTargetArgs.push(args);
      return {
        fields: {
          key: args.key,
          'Content-Type': args.contentType,
          'x-amz-meta-client-event-id': args.clientEventId,
          'x-amz-meta-attachment-id': args.attachmentId,
        },
        url: 'https://upload.example.test',
      };
    },
  });

  const result = await handler(
    post({
      client_event_id: 'form_123',
      files: [
        {
          byte_size: 1024,
          client_file_id: 'file-1',
          content_type: 'image/jpeg',
          name: '../seat.jpg',
        },
        {
          byte_size: 2048,
          client_file_id: 'file-2',
          content_type: 'image/heic',
          name: 'phone.heic',
        },
      ],
    }),
  );
  const body = JSON.parse(result.body) as {
    attachments: Array<{
      client_file_id: string;
      key: string;
      upload: { fields: Record<string, string> };
    }>;
    unsupported_count: number;
  };

  assert.equal(result.statusCode, 200);
  assert.equal(body.unsupported_count, 1);
  assert.equal(body.attachments.length, 1);
  assert.equal(body.attachments[0]?.client_file_id, 'file-1');
  assert.match(body.attachments[0]?.key ?? '', /^form\/form_123\//);
  assert.equal(body.attachments[0]?.upload.fields['Content-Type'], 'image/jpeg');
  assert.equal(uploadTargetArgs[0]?.contentType, 'image/jpeg');
});
