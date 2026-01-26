import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

const leadToEmail = process.env.LEAD_TO_EMAIL ?? 'victor@craigs.autos';
const leadFromEmail = process.env.LEAD_FROM_EMAIL ?? 'victor@craigs.autos';

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

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
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
}): Promise<void> {
  const { threadId, locale, pageUrl, chatUser, threadTitle, transcript } = args;

  const subjectBase = threadTitle ? `New chat lead: ${threadTitle}` : 'New chat lead';
  const subject = `${subjectBase} (${threadId})`;

  const introLines = [
    'New chat lead from chat.craigs.autos',
    '',
    `Thread: ${threadId}`,
    `Chat user: ${chatUser}`,
    locale ? `Locale: ${locale}` : '',
    pageUrl ? `Page: ${pageUrl}` : '',
    '',
    'Transcript:',
    '',
  ].filter(Boolean);

  const transcriptLines = transcript.map((line) => {
    const when = formatTimestamp(line.created_at);
    return `[${when}] ${line.speaker}: ${line.text}`;
  });

  const bodyText = [...introLines, ...transcriptLines].join('\n\n');

  await ses.send(
    new SendEmailCommand({
      Source: leadFromEmail,
      Destination: { ToAddresses: [leadToEmail] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: bodyText, Charset: 'UTF-8' },
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

    await sendTranscriptEmail({
      threadId,
      locale,
      pageUrl,
      chatUser: threadUser ?? chatUser,
      threadTitle,
      transcript: lines,
    });

    return json(200, { ok: true, sent: true });
  } catch (err: any) {
    console.error('Lead email failed', err?.name, err?.message);
    return json(500, { error: 'Failed to send lead email' });
  }
};

