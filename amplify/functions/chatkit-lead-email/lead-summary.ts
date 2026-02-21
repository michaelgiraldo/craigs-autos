import OpenAI from 'openai';
import type { LeadSummary, TranscriptLine } from './lead-types';
import { isPlausibleEmail, isPlausiblePhone, trimTranscriptForModel } from './text-utils';

function sanitizeLeadSummary(input: any): LeadSummary | null {
  if (!input || typeof input !== 'object') return null;

  const pickStringOrNull = (value: any): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null;

  const pickStringArray = (value: any): string[] =>
    Array.isArray(value)
      ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
      : [];

  const summaryText = typeof input.summary === 'string' ? input.summary.trim() : '';
  if (!summaryText) return null;

  const customerEmail = pickStringOrNull(input.customer_email);
  const customerPhone = pickStringOrNull(input.customer_phone);
  const handoffReady = typeof input.handoff_ready === 'boolean' ? input.handoff_ready : false;
  const handoffReason = typeof input.handoff_reason === 'string' ? input.handoff_reason.trim() : '';

  return {
    customer_name: pickStringOrNull(input.customer_name),
    customer_phone: customerPhone && isPlausiblePhone(customerPhone) ? customerPhone : null,
    customer_email: customerEmail && isPlausibleEmail(customerEmail) ? customerEmail : null,
    customer_location: pickStringOrNull(input.customer_location),
    customer_language: pickStringOrNull(input.customer_language),
    vehicle: pickStringOrNull(input.vehicle),
    project: pickStringOrNull(input.project),
    timeline: pickStringOrNull(input.timeline),
    handoff_ready: handoffReady,
    handoff_reason: handoffReason || (handoffReady ? 'handoff_ready' : 'not_ready'),
    summary: summaryText,
    next_steps: pickStringArray(input.next_steps).slice(0, 6),
    follow_up_questions: pickStringArray(input.follow_up_questions).slice(0, 6),
    call_script_prompts: pickStringArray(input.call_script_prompts).slice(0, 3),
    outreach_message: pickStringOrNull(input.outreach_message),
    missing_info: pickStringArray(input.missing_info).slice(0, 8),
  };
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
      project: { type: ['string', 'null'] },
      timeline: { type: ['string', 'null'] },
      handoff_ready: { type: 'boolean' },
      handoff_reason: { type: 'string' },
      summary: { type: 'string' },
      next_steps: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      follow_up_questions: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      call_script_prompts: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      outreach_message: { type: ['string', 'null'] },
      missing_info: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    },
    required: [
      'customer_name',
      'customer_phone',
      'customer_email',
      'customer_location',
      'customer_language',
      'vehicle',
      'project',
      'timeline',
      'handoff_ready',
      'handoff_reason',
      'summary',
      'next_steps',
      'follow_up_questions',
      'call_script_prompts',
      'outreach_message',
      'missing_info',
    ],
  };

  try {
    const response = await args.openai.responses.parse({
      model: args.leadSummaryModel,
      instructions: [
        "You format internal lead emails for an auto upholstery shop. Extract details from the customer's chat transcript.",
        '',
        'Rules:',
        'Only use information that is explicitly present in the transcript. If something is missing, use null (or empty lists). Do not guess.',
        'handoff_ready should be true only when the conversation has reached minimum lead quality:',
        '- At least one contact method is present (customer_phone or customer_email).',
        '- The customer has described what they need for their vehicle/item (project is present or explicit request is present).',
        '- There is enough context for follow-up (vehicle make/model/item type is present, OR this is explicitly identified elsewhere in transcript).',
        'If any of these are missing, set handoff_ready to false.',
        'handoff_reason should be a short reason explaining why it is or is not ready, from one of:',
        '"missing_contact", "missing_project_details", "missing_vehicle_context", "ready_for_follow_up".',
        'If handoff_ready is false, include any missing items in missing_info using short labels.',
        'Write the summary and next steps in English.',
        'customer_language should reflect the language the customer is using. If unclear, use the provided locale.',
        'call_script_prompts must be exactly 3 short questions the shop can ask to move the lead forward (prioritize missing info). Do not repeat questions already answered in the transcript.',
        'follow_up_questions must only include questions that are NOT already answered in the transcript.',
        `outreach_message should be one short paragraph in customer_language that the shop can send (text or email). It must mention ${args.shopName} and include the shop phone ${args.shopPhoneDisplay}. Keep it friendly, no prices, and ask for photos when helpful.`,
        'Do not mention prices or quotes. Do not invent shop hours or policies.',
        'Keep next_steps and follow_up_questions short and actionable (one sentence each).',
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
      max_output_tokens: 700,
    });

    return sanitizeLeadSummary(response.output_parsed);
  } catch (err: any) {
    console.error('Lead summary generation failed', err?.name, err?.message);
    return null;
  }
}
