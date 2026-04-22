import type OpenAI from 'openai';
import { buildEmailSignature, buildSmsSignature } from '@craigs/business-profile/business-profile';
import { LEAD_AI_TASK_POLICY } from '@craigs/contracts/lead-ai-policy';
import { getErrorDetails } from '../_shared/safe.ts';
import type {
  LeadFollowupDrafts,
  LeadFollowupWorkItem,
} from '../_lead-platform/domain/lead-followup-work.ts';
import {
  appendCanonicalBusinessSignature,
  buildOutreachDrafts,
} from '../_lead-platform/services/outreach-drafts.ts';
import type { LoadedLeadPhotoAttachment } from './lead-attachments.ts';

type LeadFollowupDraftGenerationResult = {
  aiError: string;
  aiModel: string;
  aiStatus: 'generated' | 'fallback';
  drafts: LeadFollowupDrafts;
};

function compact(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const LOCALE_LANGUAGE_LABELS: Record<string, string> = {
  ar: 'Arabic',
  en: 'English',
  es: 'Spanish',
  fa: 'Persian',
  fr: 'French',
  hi: 'Hindi',
  id: 'Indonesian',
  ja: 'Japanese',
  ko: 'Korean',
  pa: 'Punjabi',
  'pt-br': 'Portuguese - Brazil',
  ru: 'Russian',
  ta: 'Tamil',
  te: 'Telugu',
  tl: 'Filipino (Tagalog)',
  vi: 'Vietnamese',
  'zh-hans': 'Simplified Chinese',
  'zh-hant': 'Traditional Chinese',
};

function normalizeLanguageHint(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function resolveLeadReplyLanguage(record: LeadFollowupWorkItem): string {
  const explicitLanguage = normalizeLanguageHint(record.customer_language);
  if (explicitLanguage) return LOCALE_LANGUAGE_LABELS[explicitLanguage] ?? record.customer_language;

  const locale = normalizeLanguageHint(record.locale);
  if (locale) return LOCALE_LANGUAGE_LABELS[locale] ?? record.locale;

  return 'English';
}

function isEmailFirstRecord(record: LeadFollowupWorkItem): boolean {
  return record.capture_channel === 'email' || record.preferred_outreach_channel === 'email';
}

function deliveryIntentForRecord(record: LeadFollowupWorkItem): string {
  if (isEmailFirstRecord(record)) return 'email first response';
  if (record.preferred_outreach_channel === 'sms') return 'SMS first, email fallback if needed';
  return 'SMS when a usable phone is available; email fallback otherwise';
}

function sourceContextForRecord(record: LeadFollowupWorkItem): string {
  if (record.capture_channel === 'email') {
    return [
      `Inbound subject: ${record.inbound_email_subject || 'not provided'}`,
      `Inbound Message-ID: ${record.source_message_id || 'not provided'}`,
      'This is a threaded email reply to an existing customer email.',
    ].join('\n');
  }

  if (record.capture_channel === 'chat') {
    return [
      `Chat thread id: ${record.chat_thread_id || 'not provided'}`,
      `Chat thread title: ${record.chat_thread_title || 'not provided'}`,
      'ChatKit photo references are tracked for context/counts, but image bytes are not loaded into this worker in v1.',
    ].join('\n');
  }

  return [
    `Form page: ${record.page_url || 'not provided'}`,
    'This is a public quote form submission.',
  ].join('\n');
}

function channelOverlayForRecord(record: LeadFollowupWorkItem): string {
  if (record.capture_channel === 'email') {
    return [
      'Channel overlay: inbound email',
      'Reply as a direct threaded email response. Be specific to the customer email and do not sound like a generic form receipt.',
      'Do not ask questions already answered in the original email.',
    ].join('\n');
  }

  if (record.capture_channel === 'chat') {
    return [
      'Channel overlay: website chat handoff',
      'Continue naturally from the chat. The customer already had a conversation, so avoid repeating solved setup questions.',
      'Use the lead summary and already asked questions to keep the response efficient.',
    ].join('\n');
  }

  return [
    'Channel overlay: public quote form',
    'This is the first business response to a form submission. Acknowledge the request and move directly to the next useful step.',
  ].join('\n');
}

export function buildLeadFollowupDraftContext(args: {
  loadedPhotoCount: number;
  record: LeadFollowupWorkItem;
}): {
  deliveryIntent: string;
  loadedPhotoCount: number;
  photoReferenceCount: number;
  replyLanguage: string;
  sourceContext: string;
  threadedEmailReply: boolean;
  unsupportedAttachmentCount: number;
} {
  return {
    deliveryIntent: deliveryIntentForRecord(args.record),
    loadedPhotoCount: args.loadedPhotoCount,
    photoReferenceCount:
      args.record.photo_attachment_count ?? args.record.inbound_photo_attachment_count ?? 0,
    replyLanguage: resolveLeadReplyLanguage(args.record),
    sourceContext: sourceContextForRecord(args.record),
    threadedEmailReply: Boolean(args.record.source_message_id),
    unsupportedAttachmentCount: args.record.unsupported_attachment_count ?? 0,
  };
}

export function buildLeadFollowupDraftTextInput(args: {
  loadedPhotoCount: number;
  record: LeadFollowupWorkItem;
}): string {
  const context = buildLeadFollowupDraftContext(args);
  return [
    `Capture channel: ${args.record.capture_channel || 'form'}`,
    `Reply language: ${context.replyLanguage}`,
    `Customer language hint: ${args.record.customer_language || 'not provided'}`,
    `Locale: ${args.record.locale || 'not provided'}`,
    `Delivery intent: ${context.deliveryIntent}`,
    `Threaded email reply: ${context.threadedEmailReply ? 'yes' : 'no'}`,
    `Photo references accepted: ${context.photoReferenceCount}`,
    `Photos loaded for OpenAI: ${context.loadedPhotoCount}`,
    `Unsupported attachments ignored: ${context.unsupportedAttachmentCount}`,
    '',
    channelOverlayForRecord(args.record),
    '',
    'Source context:',
    context.sourceContext,
    '',
    'Lead summary:',
    `Project summary: ${args.record.lead_summary?.project_summary || args.record.message || 'not provided'}`,
    `Known facts: ${(args.record.lead_summary?.known_facts ?? []).join('; ') || 'none'}`,
    `Missing info: ${(args.record.lead_summary?.missing_info ?? []).join('; ') || 'none'}`,
    `Recommended next steps: ${(args.record.lead_summary?.recommended_next_steps ?? []).join('; ') || 'none'}`,
    `Already asked questions: ${(args.record.lead_summary?.already_asked_questions ?? []).join('; ') || 'none'}`,
    `Customer response policy: ${args.record.customer_response_policy ?? 'automatic'}`,
    `Customer response policy reason: ${args.record.customer_response_policy_reason || 'not provided'}`,
    '',
    `Name: ${args.record.name || 'unknown'}`,
    `Email: ${args.record.email || 'not provided'}`,
    `Phone: ${args.record.phone || 'not provided'}`,
    `Vehicle: ${args.record.vehicle || 'not provided'}`,
    `Service: ${args.record.service || 'not provided'}`,
    `Message: ${args.record.message || 'not provided'}`,
  ].join('\n');
}

function missingInfoForQuoteRequest(record: LeadFollowupWorkItem): string[] {
  if (record.lead_summary?.missing_info?.length) return record.lead_summary.missing_info;
  const missing: string[] = [];
  if (!record.vehicle) missing.push('vehicle details');
  if (!record.service) missing.push('service needed');
  if (!record.message) missing.push('project details');
  if (!record.phone && !record.email) missing.push('contact method');
  return missing;
}

export function buildFallbackLeadFollowupDrafts(args: {
  record: LeadFollowupWorkItem;
  shopAddress: string;
  shopName: string;
  shopPhoneDigits: string;
  shopPhoneDisplay: string;
}): LeadFollowupDrafts {
  const drafts = buildOutreachDrafts({
    leadSummary: {
      customer_name: args.record.lead_summary?.customer_name ?? args.record.name ?? null,
      vehicle: args.record.lead_summary?.vehicle ?? args.record.vehicle ?? null,
      service: args.record.lead_summary?.service ?? args.record.service ?? null,
      project_summary: args.record.lead_summary?.project_summary ?? args.record.message ?? null,
    },
    shopName: args.shopName,
    shopPhoneDisplay: args.shopPhoneDisplay,
    shopPhoneDigits: args.shopPhoneDigits,
    shopAddress: args.shopAddress,
  });

  return {
    smsBody: drafts.smsDraft,
    emailSubject: drafts.emailDraftSubject,
    emailBody: drafts.emailDraftBody,
    missingInfo: missingInfoForQuoteRequest(args.record),
  };
}

function applyDeterministicDraftSignatures(
  drafts: LeadFollowupDrafts,
  args: {
    shopAddress: string;
    shopName: string;
    shopPhoneDisplay: string;
  },
): LeadFollowupDrafts {
  const smsSignature = buildSmsSignature({
    shopName: args.shopName,
    shopPhoneDisplay: args.shopPhoneDisplay,
  });
  const emailSignature = buildEmailSignature({
    shopName: args.shopName,
    shopPhoneDisplay: args.shopPhoneDisplay,
    shopAddress: args.shopAddress,
  });
  const canonicalSignatures = [emailSignature, smsSignature];

  return {
    ...drafts,
    smsBody: appendCanonicalBusinessSignature({
      body: drafts.smsBody,
      signature: smsSignature,
      stripSignatures: canonicalSignatures,
    }),
    emailBody: appendCanonicalBusinessSignature({
      body: drafts.emailBody,
      signature: emailSignature,
      stripSignatures: canonicalSignatures,
    }),
  };
}

function sanitizeDraftOutput(input: unknown): LeadFollowupDrafts | null {
  if (!input || typeof input !== 'object') return null;
  const data = input as Record<string, unknown>;
  const smsBody = typeof data.sms_body === 'string' ? compact(data.sms_body) : '';
  const emailSubject = typeof data.email_subject === 'string' ? compact(data.email_subject) : '';
  const emailBody = typeof data.email_body === 'string' ? compact(data.email_body) : '';
  const missingInfo = Array.isArray(data.missing_info)
    ? data.missing_info
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item): item is string => Boolean(item))
        .slice(0, 6)
    : [];

  if (!smsBody || !emailSubject || !emailBody) return null;
  return { smsBody, emailSubject, emailBody, missingInfo };
}

export async function generateLeadFollowupDrafts(args: {
  openai: OpenAI | null;
  model: string;
  photos?: LoadedLeadPhotoAttachment[];
  record: LeadFollowupWorkItem;
  shopAddress: string;
  shopName: string;
  shopPhoneDigits: string;
  shopPhoneDisplay: string;
}): Promise<LeadFollowupDraftGenerationResult> {
  const fallbackDrafts = buildFallbackLeadFollowupDrafts(args);
  const model = args.model.trim();

  if (!args.openai || !model) {
    return {
      aiError: args.openai ? 'QUOTE_OUTREACH_MODEL is missing' : 'OpenAI client unavailable',
      aiModel: model,
      aiStatus: 'fallback',
      drafts: fallbackDrafts,
    };
  }

  try {
    const loadedPhotoCount = args.photos?.length ?? 0;
    const textInput = buildLeadFollowupDraftTextInput({
      loadedPhotoCount,
      record: args.record,
    });
    const response = await args.openai.responses.parse({
      model,
      reasoning: LEAD_AI_TASK_POLICY.customerFollowupDraft.reasoning,
      instructions: [
        'You draft the first customer follow-up for an auto upholstery lead.',
        'This is not a price quote. It is an acknowledgment and next-step message.',
        '',
        'Rules:',
        'Write sms_body and email_body in the Reply language provided in the user context.',
        'Acknowledge the customer by name when available.',
        'Reference the submitted vehicle, requested service, or message when available.',
        'Use the normalized lead summary as the source of truth for facts, missing info, and next steps.',
        'Use loaded customer photos only to understand visible project details. Do not invent details that are not visible or stated.',
        'If photos are referenced but not loaded, do not claim to have reviewed those photos.',
        'For chat leads, do not repeat questions that the chat already asked unless the answer is still missing.',
        'For email leads, write as a direct reply to the original email.',
        'For form leads, write as the first response to a quote request.',
        'Ask for 2-4 photos when helpful.',
        'Ask for any missing details needed to move the request forward.',
        'Do not include the shop name, phone number, address, or signature; the system appends the canonical business signature.',
        'Do not mention prices, estimates, timelines, or promises.',
        'Keep sms_body concise and text-friendly.',
        'Keep email_subject short and professional.',
        'Keep email_body polite, clear, and slightly fuller than the SMS.',
        'missing_info should contain short labels for important gaps only.',
      ].join('\n'),
      input: args.photos?.length
        ? [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: textInput,
                },
                ...args.photos.map((photo) => ({
                  type: 'input_image' as const,
                  detail: 'low' as const,
                  image_url: photo.dataUrl,
                })),
              ],
            },
          ]
        : textInput,
      text: {
        format: {
          type: 'json_schema',
          name: 'quote_outreach',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              sms_body: { type: 'string' },
              email_subject: { type: 'string' },
              email_body: { type: 'string' },
              missing_info: { type: 'array', items: { type: 'string' }, maxItems: 6 },
            },
            required: ['sms_body', 'email_subject', 'email_body', 'missing_info'],
          },
        },
      },
      max_output_tokens: LEAD_AI_TASK_POLICY.customerFollowupDraft.maxOutputTokens,
    });

    const parsed = sanitizeDraftOutput(response.output_parsed);
    if (!parsed) {
      return {
        aiError: 'OpenAI draft response was incomplete',
        aiModel: model,
        aiStatus: 'fallback',
        drafts: fallbackDrafts,
      };
    }

    return {
      aiError: '',
      aiModel: model,
      aiStatus: 'generated',
      drafts: applyDeterministicDraftSignatures(parsed, args),
    };
  } catch (error: unknown) {
    const { message } = getErrorDetails(error);
    return {
      aiError: message ?? 'OpenAI draft generation failed',
      aiModel: model,
      aiStatus: 'fallback',
      drafts: fallbackDrafts,
    };
  }
}
