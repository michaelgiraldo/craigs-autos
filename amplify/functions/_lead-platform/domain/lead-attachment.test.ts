import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEAD_PHOTO_LIMITS,
  classifyLeadPhotoCandidates,
  isSupportedLeadPhotoContentType,
  sanitizeLeadAttachmentFilename,
  sanitizeLeadAttachmentPathSegment,
} from './lead-attachment.ts';

test('lead photo content type support is intentionally limited for v1', () => {
  assert.equal(isSupportedLeadPhotoContentType('image/jpeg'), true);
  assert.equal(isSupportedLeadPhotoContentType('image/png'), true);
  assert.equal(isSupportedLeadPhotoContentType('image/webp'), true);
  assert.equal(isSupportedLeadPhotoContentType('image/gif'), false);
  assert.equal(isSupportedLeadPhotoContentType('image/heic'), false);
  assert.equal(isSupportedLeadPhotoContentType('application/pdf'), false);
});

test('classifyLeadPhotoCandidates enforces type, size, count, and total byte limits', () => {
  const oneMb = 1024 * 1024;
  const result = classifyLeadPhotoCandidates([
    { contentType: 'image/jpeg', filename: 'seat.jpg', item: 'a', size: oneMb },
    { contentType: 'image/png', filename: 'door.png', item: 'b', size: oneMb },
    { contentType: 'image/webp', filename: 'top.webp', item: 'c', size: oneMb },
    { contentType: 'image/heic', filename: 'phone.heic', item: 'd', size: oneMb },
    { contentType: 'application/zip', filename: 'archive.zip', item: 'e', size: oneMb },
    { contentType: 'image/jpeg', filename: 'empty.jpg', item: 'f', size: 0 },
    {
      contentType: 'image/jpeg',
      filename: 'large.jpg',
      item: 'g',
      size: LEAD_PHOTO_LIMITS.maxBytesPerPhoto + 1,
    },
    { contentType: 'image/jpeg', filename: 'fourth.jpg', item: 'h', size: oneMb },
    { contentType: 'image/jpeg', filename: 'fifth.jpg', item: 'i', size: oneMb },
  ]);

  assert.deepEqual(
    result.accepted.map((candidate) => candidate.item),
    ['a', 'b', 'c', 'h'],
  );
  assert.equal(result.unsupportedCount, 5);
});

test('classifyLeadPhotoCandidates rejects photos that exceed the total byte limit', () => {
  const result = classifyLeadPhotoCandidates([
    { contentType: 'image/jpeg', filename: 'one.jpg', item: 1, size: 5 * 1024 * 1024 },
    { contentType: 'image/jpeg', filename: 'two.jpg', item: 2, size: 5 * 1024 * 1024 },
    { contentType: 'image/jpeg', filename: 'three.jpg', item: 3, size: 3 * 1024 * 1024 },
  ]);

  assert.deepEqual(
    result.accepted.map((candidate) => candidate.item),
    [1, 2],
  );
  assert.equal(result.unsupportedCount, 1);
});

test('lead attachment sanitizers keep safe key and filename values', () => {
  assert.equal(sanitizeLeadAttachmentPathSegment('form_abc-123'), 'form_abc-123');
  assert.equal(sanitizeLeadAttachmentPathSegment(' weird value / here '), 'weird-value-here');
  assert.equal(sanitizeLeadAttachmentFilename('../bad\nname', 'image/png'), 'bad name.png');
});
