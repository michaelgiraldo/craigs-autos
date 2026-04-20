import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEmailThreadingHeaders,
  buildReplySubject,
  normalizeEmailMessageId,
} from './email-threading.ts';

test('normalizeEmailMessageId wraps bare message ids', () => {
  assert.equal(normalizeEmailMessageId('message@example.com'), '<message@example.com>');
  assert.equal(normalizeEmailMessageId('<message@example.com>'), '<message@example.com>');
  assert.equal(normalizeEmailMessageId('  '), '');
});

test('buildReplySubject preserves the original inbound subject text', () => {
  assert.equal(
    buildReplySubject('2014 Honda Accord driver seat tear repair estimate'),
    'Re: 2014 Honda Accord driver seat tear repair estimate',
  );
  assert.equal(buildReplySubject('Re: Seat repair'), 'Re: Seat repair');
  assert.equal(buildReplySubject(''), "Re: Your message to Craig's Auto Upholstery");
});

test('buildEmailThreadingHeaders dedupes references and appends the source message id', () => {
  assert.deepEqual(
    buildEmailThreadingHeaders({
      sourceMessageId: '<message-2@example.com>',
      sourceReferences: '<message-1@example.com> <message-1@example.com>',
    }),
    {
      'In-Reply-To': '<message-2@example.com>',
      References: '<message-1@example.com> <message-2@example.com>',
    },
  );
});
