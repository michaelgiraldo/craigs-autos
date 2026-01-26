import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

const leadToEmail = process.env.LEAD_TO_EMAIL ?? 'victor@craigs.autos';
const leadFromEmail = process.env.LEAD_FROM_EMAIL ?? 'victor@craigs.autos';
const leadSummaryModel = process.env.LEAD_SUMMARY_MODEL ?? 'gpt-4.1-mini';

const ses = new SESClient({});

type LambdaHeaders = Record<string, string | undefined>;

type LambdaEvent = {
  headers?: LambdaHeaders | null;
  requestContext?: { http?: { method?: string } } | null;
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
};

type LambdaResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

type LeadEmailRequest = {
  threadId?: unknown;
  locale?: unknown;
  pageUrl?: unknown;
  user?: unknown;
};

function json(statusCode: number, body: unknown): LambdaResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function decodeBody(event: LambdaEvent): string | null {
  const raw = event?.body;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (event?.isBase64Encoded) {
    return Buffer.from(raw, 'base64').toString('utf8');
  }
  return raw;
}

function isValidThreadId(value: string): boolean {
  return value.startsWith('cthr_') && value.length > 'cthr_'.length;
}

function formatTimestamp(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  return date.toISOString().replace('T', ' ').replace('Z', 'Z');
}

type TranscriptLine = {
  created_at: number;
  speaker: string;
  text: string;
};

type LeadSummary = {
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_location: string | null;
  vehicle: string | null;
  project: string | null;
  timeline: string | null;
  summary: string;
  next_steps: string[];
  follow_up_questions: string[];
  missing_info: string[];
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatListText(items: string[], prefix = '- '): string {
  return items.map((item) => `${prefix}${item}`).join('\n');
}

function formatListHtml(items: string[]): string {
  if (!items.length) return '<p style="margin:0;color:#6b7280">None.</p>';
  const li = items.map((item) => `<li style="margin:0 0 8px">${escapeHtml(item)}</li>`).join('');
  return `<ol style="margin:0;padding-left:20px">${li}</ol>`;
}

function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isPlausiblePhone(value: string): boolean {
  const digits = value.replace(/[^\d]/g, '');
  return digits.length >= 7;
}

function sanitizeLeadSummary(input: any): LeadSummary | null {
  if (!input || typeof input !== 'object') return null;

  const pickStringOrNull = (value: any): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null;

  const pickStringArray = (value: any): string[] =>
    Array.isArray(value)
      ? value
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
      : [];

  const summaryText = typeof input.summary === 'string' ? input.summary.trim() : '';
  if (!summaryText) return null;

  const customerEmail = pickStringOrNull(input.customer_email);
  const customerPhone = pickStringOrNull(input.customer_phone);

  return {
    customer_name: pickStringOrNull(input.customer_name),
    customer_phone: customerPhone && isPlausiblePhone(customerPhone) ? customerPhone : null,
    customer_email: customerEmail && isPlausibleEmail(customerEmail) ? customerEmail : null,
    customer_location: pickStringOrNull(input.customer_location),
    vehicle: pickStringOrNull(input.vehicle),
    project: pickStringOrNull(input.project),
    timeline: pickStringOrNull(input.timeline),
    summary: summaryText,
    next_steps: pickStringArray(input.next_steps).slice(0, 6),
    follow_up_questions: pickStringArray(input.follow_up_questions).slice(0, 6),
    missing_info: pickStringArray(input.missing_info).slice(0, 8),
  };
}

async function generateLeadSummary(args: {
  locale: string;
  pageUrl: string;
  transcript: TranscriptLine[];
}): Promise<LeadSummary | null> {
  if (!openai) return null;

  const transcriptText = args.transcript
    .map((line) => `${line.speaker}: ${line.text}`)
    .join('\n\n')
    .slice(0, 16_000);

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      customer_name: { type: ['string', 'null'] },
      customer_phone: { type: ['string', 'null'] },
      customer_email: { type: ['string', 'null'] },
      customer_location: { type: ['string', 'null'] },
      vehicle: { type: ['string', 'null'] },
      project: { type: ['string', 'null'] },
      timeline: { type: ['string', 'null'] },
      summary: { type: 'string' },
      next_steps: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      follow_up_questions: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      missing_info: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    },
    required: [
      'customer_name',
      'customer_phone',
      'customer_email',
      'customer_location',
      'vehicle',
      'project',
      'timeline',
      'summary',
      'next_steps',
      'follow_up_questions',
      'missing_info',
    ],
  };

  try {
    const response = await openai.responses.parse({
      model: leadSummaryModel,
      instructions: [
        "You format internal lead emails for an auto upholstery shop. Extract details from the customer's chat transcript.",
        '',
        'Rules:',
        'Only use information that is explicitly present in the transcript. If something is missing, use null (or empty lists). Do not guess.',
        'Write the summary and next steps in English.',
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

async function buildTranscript(threadId: string): Promise<{
  threadTitle: string | null;
  threadUser: string;
  lines: TranscriptLine[];
}> {
  if (!openai) throw new Error('Missing OpenAI client');

  const thread = await openai.beta.chatkit.threads.retrieve(threadId);

  const items: any[] = [];
  let after: string | undefined;

  for (let pageCount = 0; pageCount < 20; pageCount += 1) {
    const page = await openai.beta.chatkit.threads.listItems(threadId, {
      order: 'asc',
      limit: 100,
      ...(after ? { after } : {}),
    });

    items.push(...(page?.data ?? []));

    if (!page?.has_more) break;
    after = page?.last_id ?? after;
    if (!after) break;
  }

  const lines: TranscriptLine[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;

    if (item.type === 'chatkit.user_message') {
      const parts = Array.isArray(item.content) ? item.content : [];
      const text = parts
        .map((part: any) => (part && typeof part.text === 'string' ? part.text : ''))
        .filter(Boolean)
        .join('\n');

      const attachments = Array.isArray(item.attachments) ? item.attachments : [];
      const attachmentLines = attachments
        .map((att: any) => {
          const name = typeof att?.name === 'string' ? att.name : 'attachment';
          const mime = typeof att?.mime_type === 'string' ? att.mime_type : '';
          const url = typeof att?.preview_url === 'string' ? att.preview_url : '';
          return `Attachment: ${name}${mime ? ` (${mime})` : ''}${url ? ` ${url}` : ''}`;
        })
        .filter(Boolean);

      const fullText = normalizeWhitespace([text, ...attachmentLines].filter(Boolean).join('\n'));
      if (fullText) {
        lines.push({
          created_at: typeof item.created_at === 'number' ? item.created_at : 0,
          speaker: 'Customer',
          text: fullText,
        });
      }
      continue;
    }

    if (item.type === 'chatkit.assistant_message') {
      const parts = Array.isArray(item.content) ? item.content : [];
      const text = parts
        .map((part: any) => (part && typeof part.text === 'string' ? part.text : ''))
        .filter(Boolean)
        .join('\n');

      const fullText = normalizeWhitespace(text);
      if (fullText) {
        lines.push({
          created_at: typeof item.created_at === 'number' ? item.created_at : 0,
          speaker: 'Roxana',
          text: fullText,
        });
      }
    }
  }

  return {
    threadTitle: thread?.title ?? null,
    threadUser: thread?.user ?? 'unknown',
    lines,
  };
}

async function sendTranscriptEmail(args: {
  threadId: string;
  locale: string;
  pageUrl: string;
  chatUser: string;
  threadTitle: string | null;
  transcript: TranscriptLine[];
  leadSummary: LeadSummary | null;
}): Promise<void> {
  const { threadId, locale, pageUrl, chatUser, threadTitle, transcript, leadSummary } = args;

  const subjectContext = [leadSummary?.vehicle, leadSummary?.project]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' - ');
  const subjectBase = subjectContext
    ? `New chat lead: ${subjectContext}`
    : threadTitle
      ? `New chat lead: ${threadTitle}`
      : 'New chat lead';
  const subject = `${subjectBase} (${threadId})`;

  const introLines = ['New chat lead from chat.craigs.autos', ''].filter(Boolean);

  if (leadSummary) {
    introLines.push('At a glance');
    introLines.push(`Customer: ${leadSummary.customer_name ?? ''}`.trim());
    introLines.push(`Phone: ${leadSummary.customer_phone ?? ''}`.trim());
    introLines.push(`Email: ${leadSummary.customer_email ?? ''}`.trim());
    introLines.push(`Location: ${leadSummary.customer_location ?? ''}`.trim());
    introLines.push(`Vehicle: ${leadSummary.vehicle ?? ''}`.trim());
    introLines.push(`Project: ${leadSummary.project ?? ''}`.trim());
    introLines.push(`Timeline: ${leadSummary.timeline ?? ''}`.trim());
    introLines.push(
      leadSummary.missing_info.length
        ? `Missing: ${leadSummary.missing_info.join(', ')}`
        : 'Missing:'
    );
    introLines.push('');
    introLines.push('AI summary');
    introLines.push(leadSummary.summary);
    introLines.push('');
    if (leadSummary.next_steps.length) {
      introLines.push('Suggested next steps');
      introLines.push(formatListText(leadSummary.next_steps, '- '));
      introLines.push('');
    }
    if (leadSummary.follow_up_questions.length) {
      introLines.push('Follow-up questions');
      introLines.push(formatListText(leadSummary.follow_up_questions, '- '));
      introLines.push('');
    }
  }

  introLines.push(`Thread: ${threadId}`);
  introLines.push(`Chat user: ${chatUser}`);
  if (locale) introLines.push(`Locale: ${locale}`);
  if (pageUrl) introLines.push(`Page: ${pageUrl}`);
  introLines.push('');
  introLines.push('Transcript:');
  introLines.push('');

  const transcriptLines = transcript.map((line) => {
    const when = formatTimestamp(line.created_at);
    return `[${when}] ${line.speaker}: ${line.text}`;
  });

  const bodyText = [...introLines, ...transcriptLines].join('\n\n');

  const htmlAtAGlanceRows = [
    ['Customer', leadSummary?.customer_name],
    ['Phone', leadSummary?.customer_phone],
    ['Email', leadSummary?.customer_email],
    ['Location', leadSummary?.customer_location],
    ['Vehicle', leadSummary?.vehicle],
    ['Project', leadSummary?.project],
    ['Timeline', leadSummary?.timeline],
    ['Locale', locale || null],
    ['Page', pageUrl || null],
    ['Thread', threadId],
  ]
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0;color:#6b7280;vertical-align:top;width:140px">${escapeHtml(
          String(label)
        )}</td><td style="padding:6px 0;color:#111827">${escapeHtml(String(value))}</td></tr>`
    )
    .join('');

  const transcriptHtml = transcript
    .map((line) => {
      const when = formatTimestamp(line.created_at);
      return `<div style="margin:0 0 10px"><span style="color:#6b7280">[${escapeHtml(
        when
      )}]</span> <strong>${escapeHtml(line.speaker)}:</strong> ${escapeHtml(line.text).replace(
        /\n/g,
        '<br/>'
      )}</div>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f6f7f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
    <table role="presentation" style="width:100%;border-collapse:collapse">
      <tr>
        <td>
          <table role="presentation" style="width:100%;max-width:720px;margin:0 auto;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
            <tr>
              <td style="padding:18px 22px;background:#141cff;color:#ffffff">
                <div style="font-size:16px;font-weight:700;line-height:1.2">New chat lead</div>
                <div style="font-size:12px;opacity:.9;margin-top:4px">Craig's Auto Upholstery</div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">At a glance</div>
                <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
                  ${htmlAtAGlanceRows || '<tr><td style="color:#6b7280">No structured details extracted yet.</td></tr>'}
                </table>
              </td>
            </tr>
            ${
              leadSummary
                ? `<tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">AI summary</div>
                <p style="margin:0;line-height:1.5;color:#111827">${escapeHtml(
                  leadSummary.summary
                )}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Suggested next steps</div>
                ${formatListHtml(leadSummary.next_steps)}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Follow-up questions</div>
                ${formatListHtml(leadSummary.follow_up_questions)}
              </td>
            </tr>
            <tr>
              <td style="padding:12px 22px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px">
                AI summary is generated from the chat transcript and may need a quick review.
              </td>
            </tr>`
                : ''
            }
            <tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Transcript</div>
                <div style="font-size:13px;line-height:1.5;color:#111827">${transcriptHtml}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  await ses.send(
    new SendEmailCommand({
      Source: leadFromEmail,
      Destination: { ToAddresses: [leadToEmail] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: bodyText, Charset: 'UTF-8' },
          Html: { Data: html, Charset: 'UTF-8' },
        },
      },
    })
  );
}

export const handler = async (event: LambdaEvent): Promise<LambdaResult> => {
  const method = event?.requestContext?.http?.method ?? event?.httpMethod;

  if (method === 'OPTIONS') {
    // Lambda Function URL CORS handles the browser preflight automatically.
    return {
      statusCode: 204,
      headers: {},
      body: '',
    };
  }

  if (method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  if (!openai) {
    return json(500, { error: 'Server missing configuration' });
  }

  let payload: LeadEmailRequest = {};
  try {
    const body = decodeBody(event);
    const parsed = body ? JSON.parse(body) : {};
    payload = parsed && typeof parsed === 'object' ? (parsed as LeadEmailRequest) : {};
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const threadId = typeof payload.threadId === 'string' ? payload.threadId : '';
  if (!threadId || !isValidThreadId(threadId)) {
    return json(400, { error: 'Missing or invalid threadId' });
  }

  const locale = typeof payload.locale === 'string' ? payload.locale : '';
  const pageUrl = typeof payload.pageUrl === 'string' ? payload.pageUrl : '';
  const chatUser = typeof payload.user === 'string' ? payload.user : 'anonymous';

  try {
    const { threadTitle, threadUser, lines } = await buildTranscript(threadId);

    // Avoid sending empty transcripts (e.g., user opened chat but never messaged).
    const hasCustomerMessage = lines.some((line) => line.speaker === 'Customer');
    if (!hasCustomerMessage) {
      return json(200, { ok: true, sent: false, reason: 'empty_thread' });
    }

    const leadSummary = await generateLeadSummary({
      locale,
      pageUrl,
      transcript: lines,
    });

    await sendTranscriptEmail({
      threadId,
      locale,
      pageUrl,
      chatUser: threadUser ?? chatUser,
      threadTitle,
      transcript: lines,
      leadSummary,
    });

    return json(200, { ok: true, sent: true });
  } catch (err: any) {
    console.error('Lead email failed', err?.name, err?.message);
    return json(500, { error: 'Failed to send lead email' });
  }
};
