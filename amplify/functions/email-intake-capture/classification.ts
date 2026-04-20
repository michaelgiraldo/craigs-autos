import type OpenAI from 'openai';
import type { ResponseInputItem } from 'openai/resources/responses/responses';
import { asObject, getErrorDetails } from '../_shared/safe.ts';
import { isPlausibleEmail, normalizeWhitespace } from '../_shared/text-utils.ts';
import type {
  EmailIntakeConfig,
  EmailLeadEvaluation,
  ParsedInboundEmail,
  ParsedPhotoAttachment,
} from './types.ts';

function pickStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim()
    ? normalizeWhitespace(value).slice(0, 4_000)
    : null;
}

function pickStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? normalizeWhitespace(item).slice(0, 160) : ''))
        .filter((item): item is string => Boolean(item))
        .slice(0, 8)
    : [];
}

function sanitizeEvaluation(
  input: unknown,
  fallbackEmail: string | null,
): EmailLeadEvaluation | null {
  const data = asObject(input);
  if (!data) return null;

  const isLead = typeof data.is_inbound_lead === 'boolean' ? data.is_inbound_lead : false;
  const customerEmail = pickStringOrNull(data.customer_email) ?? fallbackEmail;

  if (isLead && (!customerEmail || !isPlausibleEmail(customerEmail))) {
    return null;
  }

  return {
    aiError: '',
    customerEmail,
    customerLanguage: pickStringOrNull(data.customer_language),
    customerName: pickStringOrNull(data.customer_name),
    customerPhone: pickStringOrNull(data.customer_phone),
    isLead,
    leadReason: pickStringOrNull(data.lead_reason) ?? (isLead ? 'email_lead' : 'not_a_lead'),
    missingInfo: pickStringArray(data.missing_info),
    projectSummary: pickStringOrNull(data.project_summary),
    service: pickStringOrNull(data.service),
    vehicle: pickStringOrNull(data.vehicle),
  };
}

function photoContent(photo: ParsedPhotoAttachment): ResponseInputItem.Message['content'][number] {
  return {
    type: 'input_image',
    detail: 'low',
    image_url: `data:${photo.contentType};base64,${photo.content.toString('base64')}`,
  };
}

function buildModelInput(args: {
  email: ParsedInboundEmail;
  photos: ParsedPhotoAttachment[];
}): ResponseInputItem[] {
  const text = [
    `From: ${args.email.from?.name || ''} <${args.email.from?.address || 'unknown'}>`,
    `To: ${args.email.to.map((item) => item.address).join(', ') || 'unknown'}`,
    `Cc: ${args.email.cc.map((item) => item.address).join(', ') || 'none'}`,
    `Subject: ${args.email.subject || '(none)'}`,
    `Message-ID: ${args.email.messageId || '(none)'}`,
    `Photo attachments accepted: ${args.photos.length}`,
    `Unsupported attachments ignored: ${args.email.unsupportedAttachmentCount}`,
    '',
    'Email body:',
    args.email.text || '(empty)',
  ].join('\n');

  return [
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text,
        },
        ...args.photos.map(photoContent),
      ],
    },
  ];
}

export function createOpenAiEmailLeadEvaluator(args: {
  config: EmailIntakeConfig;
  openai: OpenAI | null;
}): (input: {
  email: ParsedInboundEmail;
  photos: ParsedPhotoAttachment[];
}) => Promise<EmailLeadEvaluation> {
  return async ({ email, photos }) => {
    if (!args.openai || !args.config.model) {
      throw new Error('OpenAI email intake is not configured');
    }

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        is_inbound_lead: { type: 'boolean' },
        lead_reason: { type: 'string' },
        customer_name: { type: ['string', 'null'] },
        customer_email: { type: ['string', 'null'] },
        customer_phone: { type: ['string', 'null'] },
        customer_language: { type: ['string', 'null'] },
        vehicle: { type: ['string', 'null'] },
        service: { type: ['string', 'null'] },
        project_summary: { type: ['string', 'null'] },
        missing_info: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      },
      required: [
        'is_inbound_lead',
        'lead_reason',
        'customer_name',
        'customer_email',
        'customer_phone',
        'customer_language',
        'vehicle',
        'service',
        'project_summary',
        'missing_info',
      ],
    };

    try {
      const response = await args.openai.responses.parse({
        model: args.config.model,
        instructions: [
          "You classify inbound emails to Craig's Auto Upholstery and extract lead facts.",
          '',
          'Classify is_inbound_lead as true only when the sender appears to be a potential customer asking about auto, marine, motorcycle, RV, furniture, or upholstery work, repair, restoration, seats, tops, carpet, headliners, cushions, or similar shop services.',
          'Reject spam, vendors, job applicants, invoices, newsletters, delivery failures, internal staff replies, and normal follow-up emails.',
          'Use the email body and any photo attachments. Supported photos are JPEG, PNG, or WebP only; unsupported attachments were ignored.',
          '',
          'If this is a lead:',
          '- Extract only details that are present or visible. Do not guess.',
          '- The customer_email must be the sender or a clearly provided customer email.',
          '- Do not draft the customer reply. Reply copy is generated later by the follow-up worker.',
          '- missing_info should contain short labels for important gaps only.',
          '',
          'If this is not a lead, still return all required fields and set optional extracted details to null.',
        ].join('\n'),
        input: buildModelInput({ email, photos }),
        text: {
          format: {
            type: 'json_schema',
            name: 'email_lead_intake',
            strict: true,
            schema,
          },
        },
        max_output_tokens: 500,
      });

      const sanitized = sanitizeEvaluation(response.output_parsed, email.from?.address ?? null);
      if (!sanitized) {
        throw new Error('OpenAI email intake response was incomplete');
      }
      return sanitized;
    } catch (error: unknown) {
      const { message } = getErrorDetails(error);
      throw new Error(message ?? 'OpenAI email intake evaluation failed');
    }
  };
}
