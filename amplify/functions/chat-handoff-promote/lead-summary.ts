import type OpenAI from 'openai';
import { LEAD_AI_TASK_POLICY } from '@craigs/contracts/lead-ai-policy';
import { asObject, getErrorDetails } from '../_shared/safe.ts';
import { createLeadSummary } from '../_lead-platform/domain/lead-summary.ts';
import type { LeadSummary, TranscriptLine } from './lead-types';
import { isPlausibleEmail, isPlausiblePhone, trimTranscriptForModel } from './text-utils.ts';

function sanitizeLeadSummary(input: unknown): LeadSummary | null {
  const data = asObject(input);
  if (!data) return null;

  const pickStringOrNull = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null;

  const pickStringArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item): item is string => Boolean(item))
      : [];

  const projectSummary =
    pickStringOrNull(data.project_summary) ??
    pickStringOrNull(data.customer_message) ??
    pickStringOrNull(data.summary);
  if (!projectSummary) return null;

  const customerEmail = pickStringOrNull(data.customer_email);
  const customerPhone = pickStringOrNull(data.customer_phone);
  const automationReady =
    typeof data.automation_ready === 'boolean' ? data.automation_ready : false;
  const automationReason =
    typeof data.automation_reason === 'string' ? data.automation_reason.trim() : '';

  return createLeadSummary({
    captureChannel: 'chat',
    customerName: pickStringOrNull(data.customer_name),
    customerPhone: customerPhone && isPlausiblePhone(customerPhone) ? customerPhone : null,
    customerEmail: customerEmail && isPlausibleEmail(customerEmail) ? customerEmail : null,
    customerLanguage: pickStringOrNull(data.customer_language),
    vehicle: pickStringOrNull(data.vehicle),
    service: pickStringOrNull(data.service) ?? pickStringOrNull(data.project_type),
    projectSummary,
    customerMessage: pickStringOrNull(data.customer_message) ?? projectSummary,
    knownFacts: pickStringArray(data.known_facts),
    missingInfo: pickStringArray(data.missing_info),
    recommendedNextSteps: pickStringArray(data.recommended_next_steps),
    alreadyAskedQuestions: pickStringArray(data.already_asked_questions),
    customerResponsePolicy: automationReady ? 'automatic' : 'manual_review',
    customerResponsePolicyReason:
      automationReason || (automationReady ? 'ready_for_follow_up' : 'not_ready_for_automation'),
  });
}

export async function generateLeadSummary(args: {
  openai: OpenAI | null;
  leadSummaryModel: string;
  locale: string;
  pageUrl: string;
  transcript: TranscriptLine[];
  shopName: string;
  shopPhoneDisplay: string;
}): Promise<LeadSummary | null> {
  if (!args.openai) return null;

  const transcriptTextFull = args.transcript
    .map((line) => `${line.speaker}: ${line.text}`)
    .join('\n\n');
  // Prefer keeping the latest messages in context; long chats often answer key questions near the end.
  const transcriptText = trimTranscriptForModel(transcriptTextFull, 16_000);

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      customer_name: { type: ['string', 'null'] },
      customer_phone: { type: ['string', 'null'] },
      customer_email: { type: ['string', 'null'] },
      customer_location: { type: ['string', 'null'] },
      customer_language: { type: ['string', 'null'] },
      vehicle: { type: ['string', 'null'] },
      service: { type: ['string', 'null'] },
      project_summary: { type: 'string' },
      customer_message: { type: ['string', 'null'] },
      automation_ready: { type: 'boolean' },
      automation_reason: { type: 'string' },
      known_facts: { type: 'array', items: { type: 'string' }, maxItems: 12 },
      recommended_next_steps: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      already_asked_questions: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      missing_info: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    },
    required: [
      'customer_name',
      'customer_phone',
      'customer_email',
      'customer_location',
      'customer_language',
      'vehicle',
      'service',
      'project_summary',
      'customer_message',
      'automation_ready',
      'automation_reason',
      'known_facts',
      'recommended_next_steps',
      'already_asked_questions',
      'missing_info',
    ],
  };

  try {
    const response = await args.openai.responses.parse({
      model: args.leadSummaryModel,
      reasoning: LEAD_AI_TASK_POLICY.chatTranscriptLeadSummary.reasoning,
      instructions: [
        "You extract a source-neutral internal lead summary from an auto upholstery customer's chat transcript.",
        '',
        'Rules:',
        'Only use information that is explicitly present in the transcript. If something is missing, use null (or empty lists). Do not guess.',
        'automation_ready should be true only when the conversation has reached minimum lead quality for an automated customer response:',
        '- At least one contact method is present (customer_phone or customer_email).',
        '- The customer has described what they need for their vehicle/item (project is present or explicit request is present).',
        '- There is enough context for follow-up (vehicle make/model/item type is present, OR this is explicitly identified elsewhere in transcript).',
        'If any of these are missing, set automation_ready to false.',
        'automation_reason should be a short reason explaining why it is or is not ready, from one of:',
        '"missing_contact", "missing_project_details", "missing_vehicle_context", "ready_for_follow_up".',
        'If automation_ready is false, include any missing items in missing_info using short labels.',
        'project_summary is the internal lead summary in English. It should be factual, compact, and useful to a human reviewing the lead.',
        'known_facts should include short factual bullets already established in the chat.',
        'recommended_next_steps should tell the business what to do next, not what to send verbatim to the customer.',
        'already_asked_questions should list customer-facing questions that were already asked in the chat, so outreach does not repeat them.',
        'customer_language should reflect the language the customer is using. If unclear, use the provided locale.',
        'Do not draft customer SMS or email copy. Customer outreach is generated later from this summary.',
        'Do not mention prices or quotes. Do not invent shop hours or policies.',
        'Keep all list items short and actionable.',
      ].join('\n'),
      input: [
        `Locale: ${args.locale || 'unknown'}`,
        args.pageUrl ? `Page: ${args.pageUrl}` : '',
        '',
        'Transcript:',
        transcriptText,
      ]
        .filter(Boolean)
        .join('\n'),
      text: {
        format: {
          type: 'json_schema',
          name: 'lead_summary',
          strict: true,
          schema,
        },
      },
      max_output_tokens: LEAD_AI_TASK_POLICY.chatTranscriptLeadSummary.maxOutputTokens,
    });

    return sanitizeLeadSummary(response.output_parsed);
  } catch (err: unknown) {
    const { name, message } = getErrorDetails(err);
    console.error('Lead summary generation failed', name, message);
    return null;
  }
}
