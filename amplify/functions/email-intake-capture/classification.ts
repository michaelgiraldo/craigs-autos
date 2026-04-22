import type OpenAI from 'openai';
import type { ResponseInputItem } from 'openai/resources/responses/responses';
import { LEAD_AI_TASK_POLICY } from '@craigs/contracts/lead-ai-policy';
import {
  createLeadSummary,
  type LeadTriageDecision,
} from '../_lead-platform/domain/lead-summary.ts';
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

function pickTriageDecision(value: unknown): LeadTriageDecision {
  return value === 'accept' || value === 'review' || value === 'reject' ? value : 'reject';
}

function sanitizeEvaluation(
  input: unknown,
  fallbackEmail: string | null,
): EmailLeadEvaluation | null {
  const data = asObject(input);
  if (!data) return null;

  const triageDecision = pickTriageDecision(data.triage_decision);
  const isLead = triageDecision !== 'reject';
  const customerEmail = pickStringOrNull(data.customer_email) ?? fallbackEmail;

  if (isLead && (!customerEmail || !isPlausibleEmail(customerEmail))) {
    return null;
  }
  const customerResponsePolicy = triageDecision === 'accept' ? 'automatic' : 'manual_review';
  const customerResponsePolicyReason =
    pickStringOrNull(data.triage_reason) ?? (isLead ? 'email_lead' : 'not_a_lead');
  const missingInfo = pickStringArray(data.missing_info);
  const projectSummary = pickStringOrNull(data.project_summary);
  const leadSummary = createLeadSummary({
    captureChannel: 'email',
    customerName: pickStringOrNull(data.customer_name),
    customerEmail,
    customerPhone: pickStringOrNull(data.customer_phone),
    customerLanguage: pickStringOrNull(data.customer_language),
    vehicle: pickStringOrNull(data.vehicle),
    service: pickStringOrNull(data.service),
    projectSummary: projectSummary ?? customerResponsePolicyReason,
    customerMessage: projectSummary,
    knownFacts: pickStringArray(data.known_facts),
    missingInfo,
    recommendedNextSteps: pickStringArray(data.recommended_next_steps),
    alreadyAskedQuestions: [],
    customerResponsePolicy,
    customerResponsePolicyReason,
  });

  return {
    aiError: '',
    customerEmail,
    customerLanguage: pickStringOrNull(data.customer_language),
    customerName: pickStringOrNull(data.customer_name),
    customerPhone: pickStringOrNull(data.customer_phone),
    isLead,
    leadReason: customerResponsePolicyReason,
    triageDecision,
    customerResponsePolicy,
    customerResponsePolicyReason,
    leadSummary,
    missingInfo,
    projectSummary,
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
        triage_decision: { type: 'string', enum: ['accept', 'review', 'reject'] },
        triage_reason: { type: 'string' },
        customer_name: { type: ['string', 'null'] },
        customer_email: { type: ['string', 'null'] },
        customer_phone: { type: ['string', 'null'] },
        customer_language: { type: ['string', 'null'] },
        vehicle: { type: ['string', 'null'] },
        service: { type: ['string', 'null'] },
        project_summary: { type: ['string', 'null'] },
        known_facts: { type: 'array', items: { type: 'string' }, maxItems: 12 },
        recommended_next_steps: { type: 'array', items: { type: 'string' }, maxItems: 8 },
        missing_info: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      },
      required: [
        'triage_decision',
        'triage_reason',
        'customer_name',
        'customer_email',
        'customer_phone',
        'customer_language',
        'vehicle',
        'service',
        'project_summary',
        'known_facts',
        'recommended_next_steps',
        'missing_info',
      ],
    };

    try {
      const response = await args.openai.responses.parse({
        model: args.config.model,
        reasoning: LEAD_AI_TASK_POLICY.emailIntakeTriage.reasoning,
        instructions: [
          "You classify inbound emails to Craig's Auto Upholstery and extract lead facts.",
          '',
          'Return triage_decision as one of:',
          '- accept: likely customer asking about auto, marine, motorcycle, RV, furniture, or upholstery work, repair, restoration, seats, tops, carpet, headliners, cushions, or similar shop services.',
          '- review: plausible customer intent, but the email is ambiguous, underspecified, unusually risky, or should be reviewed by a human before any customer response.',
          '- reject: spam, vendors, job applicants, invoices, newsletters, delivery failures, internal staff replies, normal follow-up emails, and clear non-leads.',
          'Use the email body and any photo attachments. Supported photos are JPEG, PNG, or WebP only; unsupported attachments were ignored.',
          '',
          'If this is accept or review:',
          '- Extract only details that are present or visible. Do not guess.',
          '- The customer_email must be the sender or a clearly provided customer email.',
          '- Do not draft the customer reply. Reply copy is generated later by the follow-up worker.',
          '- known_facts should be short internal facts.',
          '- recommended_next_steps should tell the business what to do next.',
          '- missing_info should contain short labels for important gaps only.',
          '',
          'If this is reject, still return all required fields and set optional extracted details to null.',
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
        max_output_tokens: LEAD_AI_TASK_POLICY.emailIntakeTriage.maxOutputTokens,
      });

      const sanitized = sanitizeEvaluation(response.output_parsed, email.from?.address ?? null);
      if (!sanitized) {
        throw new Error('OpenAI email intake response was incomplete');
      }
      return {
        ...sanitized,
        leadSummary: {
          ...sanitized.leadSummary,
          photo_reference_count: photos.length,
          loaded_photo_count: photos.length,
          unsupported_attachment_count: email.unsupportedAttachmentCount,
        },
      };
    } catch (error: unknown) {
      const { message } = getErrorDetails(error);
      throw new Error(message ?? 'OpenAI email intake evaluation failed');
    }
  };
}
