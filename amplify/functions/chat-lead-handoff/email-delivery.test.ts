import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import type { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { CRAIGS_LEAD_ENV_DEFAULTS } from '../../../shared/business-profile.js';
import { sendTranscriptEmail, type InitialOutreachState } from './email-delivery.ts';
import type { LeadAttachment, LeadSummary, TranscriptLine } from './lead-types.ts';

const SHOP_NAME = CRAIGS_LEAD_ENV_DEFAULTS.SHOP_NAME;
const SHOP_PHONE_DISPLAY = CRAIGS_LEAD_ENV_DEFAULTS.SHOP_PHONE_DISPLAY;
const SHOP_PHONE_DIGITS = CRAIGS_LEAD_ENV_DEFAULTS.SHOP_PHONE_DIGITS;
const SHOP_ADDRESS = CRAIGS_LEAD_ENV_DEFAULTS.SHOP_ADDRESS;
const THREAD_ID = 'cthr_test_123';
const TRANSCRIPT: TranscriptLine[] = [
  {
    created_at: 1775157055,
    speaker: 'Customer',
    text: 'Michael here. My 2018 Toyota Camry has a driver seat tear. Call me at +16173062716.',
  },
];

function buildLeadSummary(overrides: Partial<LeadSummary> = {}): LeadSummary {
  return {
    customer_name: 'Michael',
    customer_phone: '+16173062716',
    customer_email: 'michael@example.com',
    customer_location: 'San Jose',
    customer_language: 'English',
    vehicle: '2018 Toyota Camry',
    project: 'Driver seat tear repair',
    timeline: 'Next week',
    handoff_ready: true,
    handoff_reason: 'ready',
    summary: 'Customer needs repair for a torn driver seat.',
    next_steps: ['Review photos', 'Confirm drop-off timing'],
    follow_up_questions: ['Can you send a close-up and a wide photo?'],
    call_script_prompts: ['Can you text a couple photos?'],
    outreach_message: null,
    missing_info: [],
    ...overrides,
  };
}

function buildAttachment(overrides: Partial<LeadAttachment> = {}): LeadAttachment {
  return {
    name: 'photo.jpg',
    mime: 'image/jpeg',
    url: 'https://example.com/photo.jpg',
    ...overrides,
  };
}

function extractDecodedBody(rawData: Uint8Array | Buffer | undefined, contentType: string): string {
  assert.ok(rawData, `missing raw email data for ${contentType}`);
  const raw = Buffer.from(rawData).toString('utf8');
  const match = raw.match(
    new RegExp(
      `Content-Type: ${contentType}; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]+?)\\r\\n--`,
      'm',
    ),
  );
  assert.ok(match, `missing ${contentType} part`);
  return Buffer.from(match[1].replace(/\r?\n/g, ''), 'base64').toString('utf8');
}

function countInlineAttachments(rawData: Uint8Array | Buffer | undefined): number {
  assert.ok(rawData, 'missing raw email data');
  const raw = Buffer.from(rawData).toString('utf8');
  return (raw.match(/Content-Disposition: inline; filename=/g) ?? []).length;
}

async function withFetchStub<T>(
  responses: Record<string, Response>,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    const response = responses[url];
    if (!response) throw new Error(`Unexpected fetch for ${url}`);
    return response;
  }) as typeof fetch;

  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function createImageBuffer(args: {
  format: 'jpeg' | 'png' | 'webp';
  height: number;
  width: number;
}): Promise<Buffer> {
  const pipeline = sharp({
    create: {
      background: { alpha: 1, b: 180, g: 120, r: 70 },
      channels: 3,
      height: args.height,
      width: args.width,
    },
  });

  if (args.format === 'png') return pipeline.png().toBuffer();
  if (args.format === 'webp') return pipeline.webp({ quality: 90 }).toBuffer();
  return pipeline.jpeg({ quality: 92 }).toBuffer();
}

async function renderLeadEmail(args: {
  attachments?: LeadAttachment[];
  leadEmailRawMessageMaxBytes?: number;
  leadSummary: LeadSummary;
  initialOutreach: InitialOutreachState;
  transcript?: TranscriptLine[];
  createMessageLinkUrl?: (args: {
    threadId: string;
    kind: 'customer' | 'draft';
    toPhone: string;
    body: string;
    baseUrl: string;
  }) => Promise<string | null>;
}) {
  let capturedRawData: Uint8Array | Buffer | undefined;
  const ses = {
    send: async (command: SendEmailCommand) => {
      const rawCommand = command as SendEmailCommand & {
        input?: { Content?: { Raw?: { Data?: Uint8Array | Buffer } } };
      };
      capturedRawData = rawCommand.input?.Content?.Raw?.Data;
      return { MessageId: 'EMAIL123' };
    },
  };

  await sendTranscriptEmail({
    ses: ses as never,
    leadToEmail: 'leads@example.test',
    leadFromEmail: 'website@example.test',
    threadId: THREAD_ID,
    locale: 'en',
    pageUrl: 'https://example.test/en/',
    chatUser: 'anon_test_user',
    reason: 'idle',
    threadTitle: 'Seat repair',
    attachments: args.attachments ?? [],
    transcript: args.transcript ?? TRANSCRIPT,
    leadSummary: args.leadSummary,
    attribution: null,
    shopName: SHOP_NAME,
    shopPhoneDisplay: SHOP_PHONE_DISPLAY,
    shopPhoneDigits: SHOP_PHONE_DIGITS,
    shopAddress: SHOP_ADDRESS,
    leadEmailRawMessageMaxBytes: args.leadEmailRawMessageMaxBytes ?? 28 * 1024 * 1024,
    initialOutreach: args.initialOutreach,
    createMessageLinkUrl:
      args.createMessageLinkUrl ??
      (async () => {
        throw new Error('createMessageLinkUrl should not have been called');
      }),
  });

  assert.ok(capturedRawData);
  return {
    inlineAttachmentCount: countInlineAttachments(capturedRawData),
    raw: Buffer.from(capturedRawData).toString('utf8'),
    textBody: extractDecodedBody(capturedRawData, 'text/plain'),
    htmlBody: extractDecodedBody(capturedRawData, 'text/html'),
  };
}

test('sendTranscriptEmail shows QUO success state without SMS quick action', async () => {
  let messageLinkCalls = 0;
  const { textBody, htmlBody } = await renderLeadEmail({
    leadSummary: buildLeadSummary(),
    initialOutreach: {
      provider: 'quo',
      channel: 'sms',
      status: 'sent',
      body: 'Hello from Test Upholstery via QUO.',
      sentAt: 1775157365,
      messageId: 'QUO123',
    },
    createMessageLinkUrl: async () => {
      messageLinkCalls += 1;
      return 'https://example.test/message/token';
    },
  });

  assert.equal(messageLinkCalls, 0);
  assert.match(textBody, /Initial outreach/);
  assert.match(textBody, /Status: Sent via QUO/);
  assert.match(textBody, /QUO message ID: QUO123/);
  assert.match(textBody, /SMS sent via QUO:/);
  assert.match(textBody, /Hello from Test Upholstery via QUO\./);
  assert.doesNotMatch(textBody, /Manual SMS fallback/);
  assert.doesNotMatch(htmlBody, /Send via SMS/);
  assert.match(htmlBody, /SMS sent via QUO/);
});

test('sendTranscriptEmail shows manual SMS fallback only when QUO fails', async () => {
  let messageLinkCalls = 0;
  const { textBody, htmlBody } = await renderLeadEmail({
    leadSummary: buildLeadSummary(),
    initialOutreach: {
      provider: 'quo',
      channel: 'sms',
      status: 'failed',
      body: 'Hello from Test Upholstery fallback SMS.',
      error: 'QUO send failed (500): upstream timeout',
    },
    createMessageLinkUrl: async () => {
      messageLinkCalls += 1;
      return 'https://example.test/message/fallback-token';
    },
  });

  assert.equal(messageLinkCalls, 1);
  assert.match(textBody, /Status: Initial outreach failed/);
  assert.match(textBody, /Error: QUO send failed \(500\): upstream timeout/);
  assert.match(textBody, /Manual SMS fallback:\nhttps:\/\/example\.test\/message\/fallback-token/);
  assert.match(textBody, /SMS draft \(manual fallback\):/);
  assert.match(htmlBody, /Initial outreach failed/);
  assert.match(htmlBody, /Send via SMS/);
  assert.match(htmlBody, /SMS draft \(manual fallback\)/);
});

test('sendTranscriptEmail avoids QUO sent state and SMS actions when no customer phone is present', async () => {
  let messageLinkCalls = 0;
  const { textBody, htmlBody } = await renderLeadEmail({
    leadSummary: buildLeadSummary({
      customer_phone: null,
      customer_email: 'michael@example.com',
    }),
    transcript: [
      {
        created_at: 1775157055,
        speaker: 'Customer',
        text: 'Michael here. My 2018 Toyota Camry has a driver seat tear.',
      },
    ],
    initialOutreach: {
      provider: 'quo',
      channel: 'sms',
      status: 'not_attempted',
      body: 'Hello from Test Upholstery.',
      error: 'No customer phone number was captured.',
    },
    createMessageLinkUrl: async () => {
      messageLinkCalls += 1;
      return 'https://example.test/message/unused-token';
    },
  });

  assert.equal(messageLinkCalls, 0);
  assert.match(textBody, /Status: Not sent automatically/);
  assert.match(textBody, /Reason: No customer phone number was captured\./);
  assert.doesNotMatch(textBody, /SMS sent via QUO/);
  assert.doesNotMatch(textBody, /SMS draft/);
  assert.doesNotMatch(htmlBody, /Send via SMS/);
  assert.doesNotMatch(htmlBody, /Sent via QUO/);
});

test('sendTranscriptEmail attaches a large jpeg that used to be over the old per-image cap', async () => {
  const oversizedJpeg = Buffer.alloc(4_117_715, 7);
  const attachment = buildAttachment();

  const { inlineAttachmentCount, textBody } = await withFetchStub(
    {
      [attachment.url]: new Response(oversizedJpeg, {
        headers: { 'content-type': 'image/jpeg' },
        status: 200,
      }),
    },
    () =>
      renderLeadEmail({
        attachments: [attachment],
        leadSummary: buildLeadSummary(),
        initialOutreach: {
          provider: 'quo',
          channel: 'sms',
          status: 'sent',
          body: 'Hello from Test Upholstery via QUO.',
          sentAt: 1775157365,
          messageId: 'QUO123',
        },
      }),
  );

  assert.equal(inlineAttachmentCount, 1);
  assert.match(textBody, /Photos\/attachments \(1\)/);
  assert.match(textBody, /photo\.jpg \(image\/jpeg\): attached/);
});

test('sendTranscriptEmail normalizes webp to jpeg for safer email delivery', async () => {
  const webpBuffer = await createImageBuffer({ format: 'webp', height: 200, width: 200 });
  const attachment = buildAttachment({
    mime: 'image/webp',
    name: 'photo.webp',
    url: 'https://example.com/photo.webp',
  });

  const { raw, textBody } = await withFetchStub(
    {
      [attachment.url]: new Response(webpBuffer, {
        headers: { 'content-type': 'image/webp' },
        status: 200,
      }),
    },
    () =>
      renderLeadEmail({
        attachments: [attachment],
        leadSummary: buildLeadSummary(),
        initialOutreach: {
          provider: 'quo',
          channel: 'sms',
          status: 'sent',
          body: 'Hello from Test Upholstery via QUO.',
          sentAt: 1775157365,
          messageId: 'QUO123',
        },
      }),
  );

  assert.match(raw, /Content-Type: image\/jpeg/);
  assert.match(raw, /filename="photo\.jpg"/);
  assert.match(textBody, /Normalized for email delivery\./);
});

test('sendTranscriptEmail omits attachments when the final raw email budget is too small', async () => {
  const jpegOne = await createImageBuffer({ format: 'jpeg', height: 1400, width: 1400 });
  const jpegTwo = await createImageBuffer({ format: 'jpeg', height: 1300, width: 1300 });
  const first = buildAttachment({
    name: 'first.jpg',
    url: 'https://example.com/first.jpg',
  });
  const second = buildAttachment({
    name: 'second.jpg',
    url: 'https://example.com/second.jpg',
  });

  const { inlineAttachmentCount, textBody } = await withFetchStub(
    {
      [first.url]: new Response(jpegOne, {
        headers: { 'content-type': 'image/jpeg' },
        status: 200,
      }),
      [second.url]: new Response(jpegTwo, {
        headers: { 'content-type': 'image/jpeg' },
        status: 200,
      }),
    },
    () =>
      renderLeadEmail({
        attachments: [first, second],
        leadEmailRawMessageMaxBytes: 20_000,
        leadSummary: buildLeadSummary(),
        initialOutreach: {
          provider: 'quo',
          channel: 'sms',
          status: 'sent',
          body: 'Hello from Test Upholstery via QUO.',
          sentAt: 1775157365,
          messageId: 'QUO123',
        },
      }),
  );

  assert.equal(inlineAttachmentCount, 0);
  assert.match(
    textBody,
    /first\.jpg \(image\/jpeg\): omitted - Omitted to fit the email size budget\./,
  );
  assert.match(
    textBody,
    /second\.jpg \(image\/jpeg\): omitted - Omitted to fit the email size budget\./,
  );
});
