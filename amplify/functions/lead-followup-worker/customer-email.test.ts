import assert from 'node:assert/strict';
import test from 'node:test';
import type { SendEmailCommandInput, SESv2Client } from '@aws-sdk/client-sesv2';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import { createSesCustomerEmailSender } from './customer-email.ts';

const PUBLIC_CONVERSATION_EMAIL = 'contact@craigs.autos';
const INTERNAL_LEAD_INBOX_EMAIL = 'leads@craigs.autos';

function createFakeSes(sent: SendEmailCommandInput[]): SESv2Client {
  return {
    send: async (command: { input: SendEmailCommandInput }) => {
      sent.push(command.input);
      return { MessageId: 'ses-message-1' };
    },
  } as unknown as SESv2Client;
}

function createSender(sent: SendEmailCommandInput[]) {
  return createSesCustomerEmailSender({
    bccEmail: INTERNAL_LEAD_INBOX_EMAIL,
    emailIntakeFromEmail: PUBLIC_CONVERSATION_EMAIL,
    emailIntakeReplyToEmail: PUBLIC_CONVERSATION_EMAIL,
    fromEmail: PUBLIC_CONVERSATION_EMAIL,
    replyToEmail: PUBLIC_CONVERSATION_EMAIL,
    ses: createFakeSes(sent),
  });
}

test('form and chat customer emails use the public conversation address', async () => {
  const sent: SendEmailCommandInput[] = [];
  const sendCustomerEmail = createSender(sent);

  await sendCustomerEmail({
    body: 'Please send 2-4 photos.',
    record: {} as LeadFollowupWorkItem,
    subject: 'Next steps',
    to: 'customer@example.com',
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.FromEmailAddress, PUBLIC_CONVERSATION_EMAIL);
  assert.deepEqual(sent[0]?.Destination?.ToAddresses, ['customer@example.com']);
  assert.deepEqual(sent[0]?.Destination?.BccAddresses, [INTERNAL_LEAD_INBOX_EMAIL]);
  assert.deepEqual(sent[0]?.ReplyToAddresses, [PUBLIC_CONVERSATION_EMAIL]);
});

test('email-intake customer replies keep threading headers and public identity', async () => {
  const sent: SendEmailCommandInput[] = [];
  const sendCustomerEmail = createSender(sent);

  await sendCustomerEmail({
    body: 'Thanks for reaching out. Please send 2-4 photos.',
    record: {
      source_message_id: '<customer-message@example.com>',
      source_references: '<thread-root@example.com>',
    } as LeadFollowupWorkItem,
    subject: 'Re: Seat repair',
    to: 'customer@example.com',
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.FromEmailAddress, PUBLIC_CONVERSATION_EMAIL);
  assert.deepEqual(sent[0]?.Destination?.ToAddresses, ['customer@example.com']);
  assert.deepEqual(sent[0]?.Destination?.BccAddresses, [INTERNAL_LEAD_INBOX_EMAIL]);
  assert.equal(sent[0]?.ReplyToAddresses, undefined);

  const raw = Buffer.from(sent[0]?.Content?.Raw?.Data ?? '').toString('utf8');
  assert.match(raw, /^From: contact@craigs\.autos$/m);
  assert.match(raw, /^To: customer@example\.com$/m);
  assert.match(raw, /^Reply-To: contact@craigs\.autos$/m);
  assert.match(raw, /^In-Reply-To: <customer-message@example\.com>$/m);
  assert.match(raw, /^References: <thread-root@example\.com> <customer-message@example\.com>$/m);
  assert.doesNotMatch(raw, /^From: victor@craigs\.autos$/m);
  assert.doesNotMatch(raw, /^Reply-To: victor@craigs\.autos$/m);
});
