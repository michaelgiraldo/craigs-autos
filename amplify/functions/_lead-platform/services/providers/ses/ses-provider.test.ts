import assert from 'node:assert/strict';
import test from 'node:test';
import type { SendEmailCommandInput, SESv2Client } from '@aws-sdk/client-sesv2';
import { createSesEmailProvider, getSesEmailReadiness } from './ses-provider.ts';

function createFakeSes(sent: SendEmailCommandInput[]): SESv2Client {
  return {
    send: async (command: { input: SendEmailCommandInput }) => {
      sent.push(command.input);
      return { MessageId: 'ses-message-1' };
    },
  } as unknown as SESv2Client;
}

test('getSesEmailReadiness reports a missing SES client', () => {
  const readiness = getSesEmailReadiness({ ses: null });

  assert.equal(readiness.provider, 'ses');
  assert.equal(readiness.capability, 'email_delivery');
  assert.equal(readiness.enabled, true);
  assert.equal(readiness.ready, false);
  assert.deepEqual(
    readiness.issues.map((issue) => issue.code),
    ['missing_client'],
  );
});

test('createSesEmailProvider sends simple email content through SES', async () => {
  const sent: SendEmailCommandInput[] = [];
  const provider = createSesEmailProvider({ ses: createFakeSes(sent) });

  const result = await provider.sendEmail({
    from: 'contact@craigs.autos',
    html: '<p>Hello</p>',
    replyTo: 'contact@craigs.autos',
    subject: 'Next steps',
    text: 'Hello',
    to: ['customer@example.com'],
  });

  assert.deepEqual(result, { messageId: 'ses-message-1' });
  assert.equal(provider.readiness.ready, true);
  assert.equal(sent[0]?.FromEmailAddress, 'contact@craigs.autos');
  assert.deepEqual(sent[0]?.Destination?.ToAddresses, ['customer@example.com']);
  assert.deepEqual(sent[0]?.ReplyToAddresses, ['contact@craigs.autos']);
  assert.equal(sent[0]?.Content?.Simple?.Subject?.Data, 'Next steps');
  assert.equal(sent[0]?.Content?.Raw, undefined);
});

test('createSesEmailProvider uses raw MIME when custom headers are present', async () => {
  const sent: SendEmailCommandInput[] = [];
  const provider = createSesEmailProvider({ ses: createFakeSes(sent) });

  await provider.sendEmail({
    from: 'contact@craigs.autos',
    headers: { 'X-Craigs-Test': 'threaded' },
    html: '<p>Hello</p>',
    replyTo: 'contact@craigs.autos',
    subject: 'Re: Seat repair',
    text: 'Hello',
    to: ['customer@example.com'],
  });

  assert.equal(sent[0]?.Content?.Simple, undefined);
  const raw = Buffer.from(sent[0]?.Content?.Raw?.Data ?? '').toString('utf8');
  assert.match(raw, /^From: contact@craigs\.autos$/m);
  assert.match(raw, /^Reply-To: contact@craigs\.autos$/m);
  assert.match(raw, /^X-Craigs-Test: threaded$/m);
});

test('createSesEmailProvider uses raw MIME when attachments are present', async () => {
  const sent: SendEmailCommandInput[] = [];
  const provider = createSesEmailProvider({ ses: createFakeSes(sent) });

  await provider.sendEmail({
    attachments: [
      {
        content: Buffer.from('photo bytes'),
        contentType: 'image/jpeg',
        filename: 'seat.jpg',
      },
    ],
    from: 'leads@craigs.autos',
    html: '<p>Hello</p>',
    subject: 'New lead',
    text: 'Hello',
    to: ['leads@craigs.autos'],
  });

  assert.equal(sent[0]?.Content?.Simple, undefined);
  const raw = Buffer.from(sent[0]?.Content?.Raw?.Data ?? '').toString('utf8');
  assert.match(raw, /^Content-Type: image\/jpeg; name="seat\.jpg"$/m);
});

test('createSesEmailProvider maps missing required fields to clear errors', async () => {
  const provider = createSesEmailProvider({ ses: createFakeSes([]) });

  await assert.rejects(
    provider.sendEmail({
      from: '',
      html: '<p>Hello</p>',
      subject: 'Next steps',
      text: 'Hello',
      to: ['customer@example.com'],
    }),
    /sender email address/,
  );

  await assert.rejects(
    provider.sendEmail({
      from: 'contact@craigs.autos',
      html: '<p>Hello</p>',
      required: { replyTo: true },
      subject: 'Next steps',
      text: 'Hello',
      to: ['customer@example.com'],
    }),
    /reply-to email address/,
  );

  await assert.rejects(
    provider.sendEmail({
      from: 'contact@craigs.autos',
      html: '<p>Hello</p>',
      required: { bcc: true },
      subject: 'Next steps',
      text: 'Hello',
      to: ['customer@example.com'],
    }),
    /BCC email address/,
  );
});
