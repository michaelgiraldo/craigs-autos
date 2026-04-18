import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AttachmentUploadError,
  assertAttachmentCanBeStored,
  normalizeAttachmentFilename,
  sanitizeObjectId,
} from './policy.ts';
import { readAttachmentUploadConfig } from './upload-config.ts';

test('attachment upload config defaults to image MIME types when env allowlist is absent', () => {
  const config = readAttachmentUploadConfig({});

  assert.equal(config.maxBytes, 8_000_000);
  assert.equal(config.allowedMimeTypes.has('image/jpeg'), true);
  assert.equal(config.allowedMimeTypes.has('application/pdf'), false);
});

test('attachment upload policy rejects unsupported MIME types', () => {
  assert.throws(
    () =>
      assertAttachmentCanBeStored({
        bytes: Buffer.from('fake'),
        mimeType: 'application/pdf',
        maxBytes: 8_000_000,
        allowedMimeTypes: new Set(['image/jpeg']),
      }),
    (error) => error instanceof AttachmentUploadError && error.code === 'unsupported_mime_type',
  );
});

test('attachment upload policy rejects oversized files', () => {
  assert.throws(
    () =>
      assertAttachmentCanBeStored({
        bytes: Buffer.alloc(3),
        mimeType: 'image/jpeg',
        maxBytes: 2,
        allowedMimeTypes: new Set(['image/jpeg']),
      }),
    (error) => error instanceof AttachmentUploadError && error.code === 'attachment_too_large',
  );
});

test('attachment filenames are sanitized and normalized without changing the extension twice', () => {
  assert.equal(normalizeAttachmentFilename('bad/name.jpg', 'image/jpeg'), 'bad_name.jpg');
  assert.equal(normalizeAttachmentFilename('photo', 'image/webp'), 'photo.webp');
  assert.equal(
    normalizeAttachmentFilename('photo.jpg.backup.jpg', 'image/jpeg'),
    'photo.jpg.backup.jpg',
  );
});

test('attachment object ids reject traversal', () => {
  assert.equal(
    sanitizeObjectId('chatkit-attachments/att_123.jpg'),
    'chatkit-attachments/att_123.jpg',
  );
  assert.equal(sanitizeObjectId('../secret'), '');
});
