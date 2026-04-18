import type OpenAI from 'openai';
import { getErrorDetails } from '../_shared/safe.ts';
import type { QuoteDrafts, QuoteSubmissionRecord } from '../_lead-core/domain/quote-request.ts';
import { buildOutreachDrafts } from '../chat-lead-handoff/drafts.ts';

type QuoteDraftGenerationResult = {
  aiError: string;
  aiModel: string;
  aiStatus: 'generated' | 'fallback';
  drafts: QuoteDrafts;
};

function compact(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function missingInfoForSubmission(record: QuoteSubmissionRecord): string[] {
  const missing: string[] = [];
  if (!record.vehicle) missing.push('vehicle details');
  if (!record.service) missing.push('service needed');
  if (!record.message) missing.push('project details');
  if (!record.phone && !record.email) missing.push('contact method');
  return missing;
}

export function buildFallbackQuoteDrafts(args: {
  record: QuoteSubmissionRecord;
  shopAddress: string;
  shopName: string;
  shopPhoneDigits: string;
  shopPhoneDisplay: string;
}): QuoteDrafts {
  const drafts = buildOutreachDrafts({
    leadSummary: {
      customer_name: args.record.name || null,
      vehicle: args.record.vehicle || null,
      project: args.record.service || null,
      outreach_message: null,
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
    missingInfo: missingInfoForSubmission(args.record),
  };
}

function sanitizeDraftOutput(input: unknown): QuoteDrafts | null {
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

export async function generateQuoteDrafts(args: {
  openai: OpenAI | null;
  model: string;
  record: QuoteSubmissionRecord;
  shopAddress: string;
  shopName: string;
  shopPhoneDigits: string;
  shopPhoneDisplay: string;
}): Promise<QuoteDraftGenerationResult> {
  const fallbackDrafts = buildFallbackQuoteDrafts(args);
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
    const response = await args.openai.responses.parse({
      model,
      instructions: [
        'You draft the first customer follow-up for an auto upholstery quote request.',
        'This is not a price quote. It is an acknowledgment and next-step message.',
        '',
        'Rules:',
        'Acknowledge the customer by name when available.',
        'Reference the submitted vehicle, requested service, or message when available.',
        `Mention ${args.shopName} and include the shop phone ${args.shopPhoneDisplay}.`,
        'Ask for 2-4 photos when helpful.',
        'Ask for any missing details needed to move the request forward.',
        'Do not mention prices, estimates, timelines, or promises.',
        'Keep sms_body concise and text-friendly.',
        'Keep email_subject short and professional.',
        'Keep email_body polite, clear, and slightly fuller than the SMS.',
        'missing_info should contain short labels for important gaps only.',
      ].join('\n'),
      input: [
        `Name: ${args.record.name || 'unknown'}`,
        `Email: ${args.record.email || 'not provided'}`,
        `Phone: ${args.record.phone || 'not provided'}`,
        `Vehicle: ${args.record.vehicle || 'not provided'}`,
        `Service: ${args.record.service || 'not provided'}`,
        `Message: ${args.record.message || 'not provided'}`,
      ].join('\n'),
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
      max_output_tokens: 500,
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
      drafts: parsed,
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
