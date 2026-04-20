import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRawEmail } from './outgoing-email.ts';

function topLevelHeaderBlock(raw: string): string {
  return raw.slice(0, raw.indexOf('\r\n\r\n'));
}

test('buildRawEmail separates top-level headers from multipart body', () => {
  const raw = buildRawEmail({
    from: 'victor@craigs.autos',
    to: ['customer@example.com'],
    replyTo: 'victor@craigs.autos',
    subject: 'Re: 2016 Toyota Tacoma',
    text: 'Plain text',
    html: '<p>Plain text</p>',
    headers: {
      'In-Reply-To': '<message@example.com>',
      References: '<message@example.com>',
    },
  }).toString('utf8');

  const headerBlock = topLevelHeaderBlock(raw);
  assert.equal([...headerBlock.matchAll(/^Content-Type:/gm)].length, 1);
  assert.match(raw, /\r\n\r\n------craigs-alt-/);
});

test('buildRawEmail keeps attachment transfer encoding in the attachment header block', () => {
  const raw = buildRawEmail({
    from: 'victor@craigs.autos',
    to: ['shop@example.com'],
    subject: 'Owner notification',
    text: 'Text',
    html: '<p>Text</p>',
    attachments: [
      {
        content: Buffer.from('jpeg bytes'),
        contentType: 'image/jpeg',
        filename: 'seat.jpg',
      },
    ],
  }).toString('utf8');

  assert.match(
    raw,
    /Content-Disposition: attachment; filename="seat\.jpg"\r\nContent-Transfer-Encoding: base64\r\n\r\n/,
  );
});
