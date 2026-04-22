import assert from 'node:assert/strict';
import test from 'node:test';
import type OpenAI from 'openai';
import { LEAD_AI_TASK_POLICY } from '@craigs/contracts/lead-ai-policy';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import {
  buildFallbackLeadFollowupDrafts,
  buildLeadFollowupDraftTextInput,
  generateLeadFollowupDrafts,
} from './drafts.ts';
import type { LoadedLeadPhotoAttachment } from './lead-attachments.ts';

function makeRecord(overrides: Partial<LeadFollowupWorkItem> = {}): LeadFollowupWorkItem {
  return {
    ai_error: '',
    ai_model: '',
    ai_status: null,
    attachment_count: 0,
    attachments: [],
    attribution: null,
    capture_channel: 'form',
    contact_id: 'contact-1',
    created_at: 1_000,
    customer_email_error: '',
    customer_email_message_id: '',
    customer_language: 'es',
    email: 'customer@example.com',
    email_body: '',
    email_status: null,
    email_subject: '',
    followup_work_id: 'followup-work-1',
    idempotency_key: 'form:followup-work-1',
    journey_id: 'journey-1',
    lead_notification_error: '',
    lead_notification_message_id: '',
    lead_notification_status: null,
    lead_record_id: 'lead-record-1',
    locale: 'es',
    message: 'Necesito reparar el asiento del conductor.',
    missing_info: [],
    name: 'Nadia',
    origin: 'https://craigs.autos/es/request-a-quote',
    outreach_channel: null,
    outreach_result: null,
    page_url: 'https://craigs.autos/es/request-a-quote',
    phone: '(408) 555-0101',
    photo_attachment_count: 1,
    service: 'seat repair',
    site_label: 'craigs.autos',
    sms_body: '',
    sms_error: '',
    sms_message_id: '',
    sms_status: null,
    source_event_id: 'source-event-1',
    status: 'queued',
    ttl: 999_999,
    unsupported_attachment_count: 0,
    updated_at: 1_000,
    user_id: 'anon-user',
    vehicle: '2016 Yamaha FZ-07',
    ...overrides,
  };
}

function textFromOpenAiInput(input: unknown): string {
  if (typeof input === 'string') return input;
  const first = Array.isArray(input) ? input[0] : null;
  const content =
    first && typeof first === 'object' && 'content' in first
      ? (first.content as Array<{ type: string; text?: string }>)
      : [];
  return content.find((item) => item.type === 'input_text')?.text ?? '';
}

function countOccurrences(value: string, pattern: string): number {
  return value.split(pattern).length - 1;
}

test('generated drafts use GPT-5.4 defaults, channel context, photos, and one deterministic signature', async () => {
  const requests: unknown[] = [];
  const openai = {
    responses: {
      parse: async (request: unknown) => {
        requests.push(request);
        return {
          output_parsed: {
            sms_body:
              "Hi Nadia, thanks for the details. Please send 2-4 photos so we can take a look.\n\nCraig's Auto Upholstery\n(408) 379-3820\n271 Bestor St, San Jose, CA 95112",
            email_subject: 'Next steps for your Yamaha seat',
            email_body:
              "Hi Nadia,\n\nThanks for reaching out about the Yamaha seat. Please send 2-4 photos so we can take a closer look.\n\nCraig's Auto Upholstery\n(408) 379-3820",
            missing_info: ['photos'],
          },
        };
      },
    },
  } as unknown as OpenAI;
  const photos: LoadedLeadPhotoAttachment[] = [
    {
      content: Buffer.from([1, 2, 3]),
      contentType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,AQID',
      filename: 'seat.jpg',
    },
  ];

  const result = await generateLeadFollowupDrafts({
    model: 'gpt-5.4-2026-03-05',
    openai,
    photos,
    record: makeRecord(),
    shopAddress: '271 Bestor St, San Jose, CA 95112',
    shopName: "Craig's Auto Upholstery",
    shopPhoneDigits: '4083793820',
    shopPhoneDisplay: '(408) 379-3820',
  });

  assert.equal(result.aiStatus, 'generated');
  assert.equal(result.aiModel, 'gpt-5.4-2026-03-05');
  assert.equal(countOccurrences(result.drafts.smsBody, "Craig's Auto Upholstery"), 1);
  assert.equal(countOccurrences(result.drafts.emailBody, "Craig's Auto Upholstery"), 1);
  assert.match(result.drafts.smsBody, /\(408\) 379-3820$/);
  assert.match(result.drafts.emailBody, /271 Bestor St, San Jose, CA 95112$/);

  const request = requests[0] as {
    input?: unknown;
    max_output_tokens?: number;
    reasoning?: unknown;
  };
  assert.deepEqual(request.reasoning, LEAD_AI_TASK_POLICY.customerFollowupDraft.reasoning);
  assert.equal(
    request.max_output_tokens,
    LEAD_AI_TASK_POLICY.customerFollowupDraft.maxOutputTokens,
  );
  const textInput = textFromOpenAiInput(request.input);
  assert.match(textInput, /Reply language: Spanish/);
  assert.match(textInput, /Capture channel: form/);
  assert.match(textInput, /Photos loaded for OpenAI: 1/);
  assert.match(textInput, /Threaded email reply: no/);
});

test('draft context is truthful for chat photo references that are not loaded', () => {
  const textInput = buildLeadFollowupDraftTextInput({
    loadedPhotoCount: 0,
    record: makeRecord({
      capture_channel: 'chat',
      chat_thread_id: 'cthr_test',
      chat_thread_title: 'VW Eos seat repair',
      customer_language: 'Japanese',
      locale: 'ja',
      photo_attachment_count: 2,
      preferred_outreach_channel: 'sms',
      unsupported_attachment_count: 1,
    }),
  });

  assert.match(textInput, /Reply language: Japanese/);
  assert.match(textInput, /Photo references accepted: 2/);
  assert.match(textInput, /Photos loaded for OpenAI: 0/);
  assert.match(textInput, /ChatKit photo references are tracked/);
});

test('fallback drafts still get exactly one deterministic signature', () => {
  const drafts = buildFallbackLeadFollowupDrafts({
    record: makeRecord(),
    shopAddress: '271 Bestor St, San Jose, CA 95112',
    shopName: "Craig's Auto Upholstery",
    shopPhoneDigits: '4083793820',
    shopPhoneDisplay: '(408) 379-3820',
  });

  assert.equal(countOccurrences(drafts.smsBody, "Craig's Auto Upholstery"), 1);
  assert.equal(countOccurrences(drafts.emailBody, "Craig's Auto Upholstery"), 1);
  assert.match(drafts.smsBody, /\(408\) 379-3820$/);
  assert.match(drafts.emailBody, /271 Bestor St, San Jose, CA 95112$/);
});
