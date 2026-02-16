import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { buildLeadEmailSubject, buildOutreachDrafts } from './drafts';

const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

const leadDedupeTableName = process.env.LEAD_DEDUPE_TABLE_NAME;
const leadDedupeDb =
  leadDedupeTableName && leadDedupeTableName.trim()
    ? DynamoDBDocumentClient.from(new DynamoDBClient({}))
    : null;

const leadAttributionTableName = process.env.LEAD_ATTRIBUTION_TABLE_NAME;
const leadAttributionDb =
  leadAttributionTableName && leadAttributionTableName.trim()
    ? DynamoDBDocumentClient.from(new DynamoDBClient({}))
    : null;

const smsLinkTokenTableName = process.env.SMS_LINK_TOKEN_TABLE_NAME;
const smsLinkDb =
  smsLinkTokenTableName && smsLinkTokenTableName.trim()
    ? DynamoDBDocumentClient.from(new DynamoDBClient({}))
    : null;

const leadToEmail = process.env.LEAD_TO_EMAIL ?? 'leads@craigs.autos';
const leadFromEmail = process.env.LEAD_FROM_EMAIL ?? 'leads@craigs.autos';
const leadSummaryModel = process.env.LEAD_SUMMARY_MODEL ?? 'gpt-5.2-2025-12-11';
const SHOP_NAME = "Craig's Auto Upholstery";
const SHOP_PHONE_DISPLAY = '(408) 379-3820';
const SHOP_PHONE_DIGITS = '4083793820';
const SHOP_ADDRESS = '271 Bestor St, San Jose, CA 95112';

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
  reason?: unknown;
  attribution?: unknown;
};

type LeadAttributionPayload = {
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  first_touch_ts: string | null;
  last_touch_ts: string | null;
  landing_page: string | null;
  referrer: string | null;
  device_type: 'mobile' | 'desktop' | null;
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

type AttachmentInfo = {
  name: string;
  mime: string | null;
  url: string;
  storageKey: string | null;
};

type InlineAttachment = {
  contentId: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  sourceUrl: string;
};

type LeadSummary = {
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_location: string | null;
  customer_language: string | null;
  vehicle: string | null;
  project: string | null;
  timeline: string | null;
  handoff_ready: boolean;
  handoff_reason: string;
  summary: string;
  next_steps: string[];
  follow_up_questions: string[];
  call_script_prompts: string[];
  outreach_message: string | null;
  missing_info: string[];
};

type LeadDedupeStatus = 'sending' | 'sent' | 'error';

type LeadDedupeRecord = {
  thread_id: string;
  status: LeadDedupeStatus;
  lock_expires_at?: number;
  lease_id?: string;
  created_at?: number;
  updated_at?: number;
  attempts?: number;
  sent_at?: number;
  message_id?: string;
  last_reason?: string;
  last_error?: string;
  ttl?: number;
};

type LeadAttributionRecord = {
  lead_id: string;
  thread_id: string;
  created_at: number;
  lead_method: 'chat';
  lead_reason: string;
  locale: string | null;
  page_url: string | null;
  user_id: string | null;
  qualified: boolean;
  qualified_at: number | null;
  uploaded: boolean;
  uploaded_at: number | null;
  device_type: 'mobile' | 'desktop' | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  first_touch_ts: string | null;
  last_touch_ts: string | null;
  landing_page: string | null;
  referrer: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  ttl: number;
};

const LEAD_DEDUPE_LEASE_SECONDS = 120;
const LEAD_DEDUPE_ERROR_COOLDOWN_SECONDS = 60;
const LEAD_DEDUPE_TTL_DAYS = 30;
const LEAD_IDLE_DELAY_SECONDS = 300;
const LEAD_ATTRIBUTION_TTL_DAYS = 180;
const SMS_LINK_TOKEN_TTL_DAYS = 7;
const LEAD_INLINE_ATTACHMENT_MAX_BYTES = 3_000_000;

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function ttlSecondsFromNow(days: number): number {
  return nowEpochSeconds() + days * 24 * 60 * 60;
}

function latestActivityEpochSeconds(lines: TranscriptLine[]): number | null {
  if (!lines.length) return null;
  let latest = 0;
  for (const line of lines) {
    const createdAt = Math.floor(line?.created_at ?? 0);
    if (createdAt > latest) latest = createdAt;
  }
  return latest > 0 ? latest : null;
}

function sanitizeLeadDedupeRecord(item: any): LeadDedupeRecord | null {
  if (!item || typeof item !== 'object') return null;
  const thread_id = typeof item.thread_id === 'string' ? item.thread_id : '';
  const status = item.status as LeadDedupeStatus;
  if (!thread_id) return null;
  if (status !== 'sending' && status !== 'sent' && status !== 'error') return null;
  return item as LeadDedupeRecord;
}

async function getLeadDedupeRecord(threadId: string): Promise<LeadDedupeRecord | null> {
  if (!leadDedupeDb || !leadDedupeTableName) return null;
  const result = await leadDedupeDb.send(
    new GetCommand({
      TableName: leadDedupeTableName,
      Key: { thread_id: threadId },
    })
  );
  return sanitizeLeadDedupeRecord(result.Item);
}

async function acquireLeadSendLease(args: {
  threadId: string;
  reason: string;
}): Promise<{ acquired: true; leaseId: string } | { acquired: false; record: LeadDedupeRecord | null }> {
  if (!leadDedupeDb || !leadDedupeTableName) {
    // No table configured (e.g., local dev) => allow sending but without cross-device idempotency.
    return { acquired: true, leaseId: randomUUID() };
  }

  const now = nowEpochSeconds();
  const leaseId = randomUUID();
  const ttl = ttlSecondsFromNow(LEAD_DEDUPE_TTL_DAYS);

  try {
    await leadDedupeDb.send(
      new UpdateCommand({
        TableName: leadDedupeTableName,
        Key: { thread_id: args.threadId },
        UpdateExpression:
          'SET #status = :sending, #lease_id = :lease_id, #lock_expires_at = :lock_expires_at, #updated_at = :now, #created_at = if_not_exists(#created_at, :now), #last_reason = :reason, #ttl = :ttl, #attempts = if_not_exists(#attempts, :zero) + :one',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#lease_id': 'lease_id',
          '#lock_expires_at': 'lock_expires_at',
          '#created_at': 'created_at',
          '#updated_at': 'updated_at',
          '#last_reason': 'last_reason',
          '#ttl': 'ttl',
          '#attempts': 'attempts',
        },
        ExpressionAttributeValues: {
          ':sending': 'sending',
          ':sent': 'sent',
          ':lease_id': leaseId,
          ':lock_expires_at': now + LEAD_DEDUPE_LEASE_SECONDS,
          ':now': now,
          ':reason': args.reason,
          ':ttl': ttl,
          ':zero': 0,
          ':one': 1,
        },
        ConditionExpression:
          'attribute_not_exists(thread_id) OR (#status <> :sent AND (attribute_not_exists(#lock_expires_at) OR #lock_expires_at < :now))',
      })
    );
    return { acquired: true, leaseId };
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      const record = await getLeadDedupeRecord(args.threadId);
      return { acquired: false, record };
    }
    throw err;
  }
}

async function markLeadSent(args: { threadId: string; leaseId: string; messageId?: string | null }) {
  if (!leadDedupeDb || !leadDedupeTableName) return;
  const now = nowEpochSeconds();
  const ttl = ttlSecondsFromNow(LEAD_DEDUPE_TTL_DAYS);
  await leadDedupeDb.send(
    new UpdateCommand({
      TableName: leadDedupeTableName,
      Key: { thread_id: args.threadId },
      UpdateExpression:
        'SET #status = :sent, #sent_at = :now, #updated_at = :now, #ttl = :ttl' +
        (args.messageId ? ', #message_id = :message_id' : '') +
        ' REMOVE #lease_id, #last_error',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#sent_at': 'sent_at',
        '#updated_at': 'updated_at',
        '#lease_id': 'lease_id',
        '#last_error': 'last_error',
        '#ttl': 'ttl',
        '#message_id': 'message_id',
      },
      ExpressionAttributeValues: {
        ':sent': 'sent',
        ':now': now,
        ':ttl': ttl,
        ...(args.messageId ? { ':message_id': args.messageId } : {}),
        ':lease_id': args.leaseId,
      },
      ConditionExpression: '#lease_id = :lease_id',
    })
  );
}

async function markLeadError(args: { threadId: string; leaseId: string; errorMessage: string }) {
  if (!leadDedupeDb || !leadDedupeTableName) return;
  const now = nowEpochSeconds();
  const ttl = ttlSecondsFromNow(LEAD_DEDUPE_TTL_DAYS);
  await leadDedupeDb.send(
    new UpdateCommand({
      TableName: leadDedupeTableName,
      Key: { thread_id: args.threadId },
      UpdateExpression:
        'SET #status = :error, #updated_at = :now, #lock_expires_at = :lock_expires_at, #last_error = :last_error, #ttl = :ttl REMOVE #lease_id',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updated_at': 'updated_at',
        '#lock_expires_at': 'lock_expires_at',
        '#last_error': 'last_error',
        '#ttl': 'ttl',
        '#lease_id': 'lease_id',
      },
      ExpressionAttributeValues: {
        ':error': 'error',
        ':now': now,
        ':lock_expires_at': now + LEAD_DEDUPE_ERROR_COOLDOWN_SECONDS,
        ':last_error': args.errorMessage.slice(0, 500),
        ':ttl': ttl,
        ':lease_id': args.leaseId,
      },
      ConditionExpression: '#lease_id = :lease_id',
    })
  );
}

async function storeLeadAttribution(args: {
  threadId: string;
  locale: string;
  pageUrl: string;
  chatUser: string;
  reason: string;
  attribution: LeadAttributionPayload | null;
  customerPhone: string | null;
  customerEmail: string | null;
}): Promise<string | null> {
  if (!leadAttributionDb || !leadAttributionTableName) return null;
  const now = nowEpochSeconds();
  const leadId = randomUUID();
  const ttl = ttlSecondsFromNow(LEAD_ATTRIBUTION_TTL_DAYS);

  const record: LeadAttributionRecord = {
    lead_id: leadId,
    thread_id: args.threadId,
    created_at: now,
    lead_method: 'chat',
    lead_reason: args.reason,
    locale: args.locale || null,
    page_url: args.pageUrl || null,
    user_id: args.chatUser || null,
    qualified: false,
    qualified_at: null,
    uploaded: false,
    uploaded_at: null,
    device_type: args.attribution?.device_type ?? null,
    gclid: args.attribution?.gclid ?? null,
    gbraid: args.attribution?.gbraid ?? null,
    wbraid: args.attribution?.wbraid ?? null,
    utm_source: args.attribution?.utm_source ?? null,
    utm_medium: args.attribution?.utm_medium ?? null,
    utm_campaign: args.attribution?.utm_campaign ?? null,
    utm_term: args.attribution?.utm_term ?? null,
    utm_content: args.attribution?.utm_content ?? null,
    first_touch_ts: args.attribution?.first_touch_ts ?? null,
    last_touch_ts: args.attribution?.last_touch_ts ?? null,
    landing_page: args.attribution?.landing_page ?? null,
    referrer: args.attribution?.referrer ?? null,
    customer_phone: args.customerPhone,
    customer_email: args.customerEmail,
    ttl,
  };

  await leadAttributionDb.send(
    new PutCommand({
      TableName: leadAttributionTableName,
      Item: record,
    })
  );
  return leadId;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeAttributionValue(value: unknown, maxLen = 256): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen);
}

function normalizeDeviceType(value: unknown): 'mobile' | 'desktop' | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'mobile' || normalized === 'desktop') return normalized;
  return null;
}

function sanitizeAttribution(input: any): LeadAttributionPayload | null {
  if (!input || typeof input !== 'object') return null;
  const payload: LeadAttributionPayload = {
    gclid: normalizeAttributionValue(input.gclid, 128),
    gbraid: normalizeAttributionValue(input.gbraid, 128),
    wbraid: normalizeAttributionValue(input.wbraid, 128),
    utm_source: normalizeAttributionValue(input.utm_source, 128),
    utm_medium: normalizeAttributionValue(input.utm_medium, 128),
    utm_campaign: normalizeAttributionValue(input.utm_campaign, 200),
    utm_term: normalizeAttributionValue(input.utm_term, 200),
    utm_content: normalizeAttributionValue(input.utm_content, 200),
    first_touch_ts: normalizeAttributionValue(input.first_touch_ts, 64),
    last_touch_ts: normalizeAttributionValue(input.last_touch_ts, 64),
    landing_page: normalizeAttributionValue(input.landing_page, 300),
    referrer: normalizeAttributionValue(input.referrer, 300),
    device_type: normalizeDeviceType(input.device_type),
  };

  const hasAny = Object.values(payload).some(
    (value) => typeof value === 'string' && value.trim().length > 0
  );
  return hasAny ? payload : null;
}

function trimTranscriptForModel(value: string, maxChars = 16_000): string {
  if (value.length <= maxChars) return value;
  const headChars = Math.min(4_000, Math.floor(maxChars * 0.25));
  const separator = '\n\n... (earlier messages omitted) ...\n\n';
  const tailChars = Math.max(0, maxChars - headChars - separator.length);
  const head = value.slice(0, headChars);
  const tail = value.slice(-tailChars);
  return `${head}${separator}${tail}`.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function toEncodedHeaderWord(value: string): string {
  const safeValue = value.replace(/[\r\n]+/g, ' ');
  if (/^[\x20-\x7e]*$/.test(safeValue)) return safeValue;
  const encoded = Buffer.from(safeValue, 'utf8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

function chunkBase64(value: string, lineLength = 76): string {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += lineLength) {
    chunks.push(value.slice(i, i + lineLength));
  }
  return chunks.join('\r\n');
}

function toBase64(value: string): string {
  return chunkBase64(Buffer.from(value, 'utf8').toString('base64'));
}

function decodeUriSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseAttachmentStorageKey(urlText: string): string {
  try {
    const parsedUrl = new URL(urlText);
    const rawId = parsedUrl.searchParams.get('id') ?? '';
    if (rawId) {
      const decoded = decodeUriSafe(rawId).trim();
      if (decoded && /^[A-Za-z0-9._/-]+$/.test(decoded) && !decoded.includes('..')) return decoded;
    }

    const pathSegment = parsedUrl.pathname.split('/').filter(Boolean).pop() ?? '';
    if (pathSegment && /^[A-Za-z0-9._/-]+$/.test(pathSegment) && !pathSegment.includes('..')) {
      return pathSegment;
    }
  } catch {
    // ignore
  }
  return '';
}

function sanitizeAttachmentFilename(value: string, mimeType: string): string {
  const normalized = typeof value === 'string' && value.trim() ? value.trim() : 'attachment';
  const safe = normalized.replace(/[<>:"/\\|?*]/g, '_').slice(0, 120);
  const hasExt = /\.[^.]+$/.test(safe);
  if (hasExt) return safe;

  const extension =
    mimeType === 'image/png'
      ? '.png'
      : mimeType === 'image/webp'
        ? '.webp'
        : mimeType === 'image/heic'
          ? '.heic'
          : mimeType === 'image/heif'
            ? '.heif'
            : '.jpg';
  return `${safe}${extension}`;
}

function pickAttachmentMime(mime: string | null): string {
  const normalized = (mime ?? '').trim().toLowerCase();
  if (normalized.startsWith('image/')) return normalized;
  return 'image/jpeg';
}

function isInlineImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}

async function fetchInlineAttachment(attachment: AttachmentInfo): Promise<InlineAttachment | null> {
  const sourceUrl = safeHttpUrl(attachment.url);
  if (!sourceUrl) return null;
  if (!attachment.storageKey) return null;
  const mimeType = pickAttachmentMime(attachment.mime);
  if (!isInlineImageMime(mimeType)) return null;
  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > LEAD_INLINE_ATTACHMENT_MAX_BYTES) return null;

    const contentType = pickAttachmentMime(
      response.headers.get('content-type') ?? mimeType
    );
    const filename = sanitizeAttachmentFilename(attachment.name, contentType);
    const contentId = `attachment-${randomUUID()}@craigs.autos`;
    return {
      contentId,
      filename,
      mimeType: contentType,
      bytes,
      sourceUrl,
    };
  } catch {
    return null;
  }
}

function buildRawEmail(args: {
  from: string;
  to: string;
  replyTo?: string | null;
  subject: string;
  textBody: string;
  htmlBody: string;
  attachments: InlineAttachment[];
}): Buffer {
  const mixedBoundary = `mixed-${randomUUID()}`;
  const alternativeBoundary = `alternative-${randomUUID()}`;
  const lines: string[] = [];

  lines.push(`From: ${toEncodedHeaderWord(args.from)}`);
  lines.push(`To: ${toEncodedHeaderWord(args.to)}`);
  if (args.replyTo) lines.push(`Reply-To: ${toEncodedHeaderWord(args.replyTo)}`);
  lines.push(`Subject: ${toEncodedHeaderWord(args.subject)}`);
  lines.push('MIME-Version: 1.0');
  lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
  lines.push('');
  lines.push(`--${mixedBoundary}`);
  lines.push(`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`);
  lines.push('');
  lines.push(`--${alternativeBoundary}`);
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(toBase64(args.textBody));
  lines.push(`--${alternativeBoundary}`);
  lines.push('Content-Type: text/html; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(toBase64(args.htmlBody));
  lines.push(`--${alternativeBoundary}--`);

  for (const attachment of args.attachments) {
    lines.push(`--${mixedBoundary}`);
    lines.push(`Content-Type: ${attachment.mimeType}`);
    lines.push(`Content-ID: <${attachment.contentId}>`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push(`Content-Disposition: inline; filename="${attachment.filename.replace(/"/g, '\\"')}"`);
    lines.push('');
    lines.push(chunkBase64(attachment.bytes.toString('base64')));
  }

  lines.push(`--${mixedBoundary}--`);
  lines.push('');
  return Buffer.from(lines.join('\r\n'), 'utf8');
}

function linkifyTextToHtml(text: string): string {
  const urlRegex = /https?:\/\/[^\s]+/g;
  let out = '';
  let lastIndex = 0;

  for (const match of text.matchAll(urlRegex)) {
    const raw = match?.[0] ?? '';
    if (!raw) continue;
    const index = typeof match.index === 'number' ? match.index : 0;
    out += escapeHtml(text.slice(lastIndex, index));

    const safe = safeHttpUrl(raw);
    if (safe) {
      out += `<a href="${escapeHtml(safe)}" style="color:#141cff;text-decoration:none">${escapeHtml(
        raw
      )}</a>`;
    } else {
      out += escapeHtml(raw);
    }

    lastIndex = index + raw.length;
  }

  out += escapeHtml(text.slice(lastIndex));
  return out.replace(/\n/g, '<br/>');
}

type SmsLinkTokenKind = 'customer' | 'draft';

type SmsLinkTokenRecord = {
  token: string;
  thread_id: string;
  kind: SmsLinkTokenKind;
  to_phone: string;
  body: string;
  created_at: number;
  ttl: number;
};

function inferSmsLinkBaseUrl(pageHref: string | null): string {
  // Always route production links through `sms.craigs.autos` (hosted on `main`), since Gmail will
  // keep https:// links but often strips `sms:` hrefs inside emails.
  //
  // In local dev, keep links on the same origin so the `/t/` page works on localhost.
  try {
    const url = pageHref ? new URL(pageHref) : null;
    const hostname = url?.hostname ?? '';
    if (hostname === 'localhost' || hostname === '127.0.0.1') return url?.origin ?? 'http://localhost:4321';
  } catch {
    // ignore
  }
  return 'https://sms.craigs.autos';
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

async function createSmsLinkUrl(args: {
  threadId: string;
  kind: SmsLinkTokenKind;
  toPhone: string;
  body: string;
  baseUrl: string;
}): Promise<string | null> {
  if (!smsLinkDb || !smsLinkTokenTableName) return null;

  const base = safeHttpUrl(args.baseUrl) ?? 'https://sms.craigs.autos';
  const token = randomUUID();
  const record: SmsLinkTokenRecord = {
    token,
    thread_id: args.threadId,
    kind: args.kind,
    to_phone: args.toPhone,
    body: args.body ?? '',
    created_at: nowEpochSeconds(),
    ttl: ttlSecondsFromNow(SMS_LINK_TOKEN_TTL_DAYS),
  };

  try {
    await smsLinkDb.send(
      new PutCommand({
        TableName: smsLinkTokenTableName,
        Item: record,
        ConditionExpression: 'attribute_not_exists(#token)',
        ExpressionAttributeNames: { '#token': 'token' },
      })
    );
  } catch (err: any) {
    console.error('Failed to write SMS link token', err?.name, err?.message);
    return null;
  }

  // Use a query param so the landing page can stay fully static (Astro SSG).
  return joinUrl(base, `/t/?token=${encodeURIComponent(token)}`);
}

function phoneToTelHref(value: string): string | null {
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`;
  return `tel:+${digits}`;
}

function phoneToSmsHref(value: string): string | null {
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  if (digits.length === 10) return `sms:+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `sms:+${digits}`;
  return `sms:+${digits}`;
}

function emailToMailto(value: string): string | null {
  const email = value.trim();
  if (!isPlausibleEmail(email)) return null;
  // Keep addr-spec literal in the `mailto:` path so clients reliably populate the "To" field.
  return `mailto:${email}`;
}

function mailtoWithDraft(email: string, subject: string, body: string): string | null {
  const base = emailToMailto(email);
  if (!base) return null;
  return `${base}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function smsWithBody(phone: string, body: string): string | null {
  const base = phoneToSmsHref(phone);
  if (!base) return null;
  // `?body=` is broadly supported; some clients may still strip `sms:` links.
  return `${base}?body=${encodeURIComponent(body)}`;
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

function localeToLanguageLabel(locale: string): string | null {
  const normalized = locale.trim().toLowerCase();
  switch (normalized) {
    case 'en':
      return 'English';
    case 'es':
      return 'Spanish';
    case 'pt-br':
      return 'Portuguese (Brazil)';
    case 'vi':
      return 'Vietnamese';
    case 'tl':
      return 'Tagalog';
    case 'ko':
      return 'Korean';
    case 'hi':
      return 'Hindi';
    case 'pa':
      return 'Punjabi';
    case 'ta':
      return 'Tamil';
    case 'ar':
      return 'Arabic';
    case 'ru':
      return 'Russian';
    case 'ja':
      return 'Japanese';
    case 'zh-hans':
      return 'Chinese (Simplified)';
    case 'zh-hant':
      return 'Chinese (Traditional)';
    default:
      return null;
  }
}

function extractCustomerContact(transcript: TranscriptLine[]): { email: string | null; phone: string | null } {
  const customerText = transcript
    .filter((line) => line.speaker === 'Customer')
    .map((line) => line.text)
    .join('\n');

  const emailMatch = customerText.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  const email = emailMatch ? emailMatch[0].trim() : null;

  const shopDigits = '4083793820';
  const phoneCandidates: string[] = [];
  const phoneRegex = /(\+?\d[\d().\-\s]{7,}\d)/g;
  for (const match of customerText.matchAll(phoneRegex)) {
    const raw = (match?.[1] ?? '').trim();
    if (!raw) continue;
    const digits = raw.replace(/[^\d]/g, '');
    if (digits === shopDigits) continue;
    if (digits.length < 10 || digits.length > 15) continue;
    phoneCandidates.push(raw);
  }
  const phone = phoneCandidates.length ? phoneCandidates[0] : null;

  return {
    email: email && isPlausibleEmail(email) ? email : null,
    phone: phone && isPlausiblePhone(phone) ? phone : null,
  };
}

function extractAttachments(transcript: TranscriptLine[]): AttachmentInfo[] {
  const seen = new Set<string>();
  const attachments: AttachmentInfo[] = [];

  for (const line of transcript) {
    const rows = typeof line.text === 'string' ? line.text.split('\n') : [];
    for (const row of rows) {
      if (!row.startsWith('Attachment:')) continue;
      let rest = row.replace(/^Attachment:\s*/, '').trim();
      if (!rest) continue;

      const urlMatch = rest.match(/https?:\/\/\S+$/);
      const urlRaw = urlMatch?.[0] ?? '';
      const urlSafe = urlRaw ? safeHttpUrl(urlRaw) : null;
      if (!urlSafe) continue;

      rest = rest.slice(0, Math.max(0, rest.length - urlRaw.length)).trim();

      let mime: string | null = null;
      const mimeMatch = rest.match(/\(([^)]+)\)\s*$/);
      if (mimeMatch && typeof mimeMatch.index === 'number') {
        mime = mimeMatch[1]?.trim() ? mimeMatch[1].trim() : null;
        rest = rest.slice(0, mimeMatch.index).trim();
      }

      const name = rest || 'attachment';
      if (seen.has(urlSafe)) continue;
      seen.add(urlSafe);
      const storageKey = parseAttachmentStorageKey(urlSafe);
      attachments.push({ name, mime, url: urlSafe, storageKey: storageKey || null });
    }
  }

  return attachments;
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

async function generateLeadSummary(args: {
  locale: string;
  pageUrl: string;
  transcript: TranscriptLine[];
}): Promise<LeadSummary | null> {
  if (!openai) return null;

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
    const response = await openai.responses.parse({
      model: leadSummaryModel,
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
        `outreach_message should be one short paragraph in customer_language that the shop can send (text or email). It must mention ${SHOP_NAME} and include the shop phone ${SHOP_PHONE_DISPLAY}. Keep it friendly, no prices, and ask for photos when helpful.`,
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
  reason: string;
  threadTitle: string | null;
  transcript: TranscriptLine[];
  leadSummary: LeadSummary | null;
  attribution: LeadAttributionPayload | null;
}): Promise<string | null> {
  const { threadId, locale, pageUrl, chatUser, reason, threadTitle, transcript, leadSummary, attribution } = args;

  const detectedContact = extractCustomerContact(transcript);
  const customerPhone = leadSummary?.customer_phone ?? detectedContact.phone;
  const customerEmail = leadSummary?.customer_email ?? detectedContact.email;
  const customerTelHref = customerPhone ? phoneToTelHref(customerPhone) : null;
  const customerMailHref = customerEmail ? emailToMailto(customerEmail) : null;

  const pageHref = pageUrl ? safeHttpUrl(pageUrl) : null;
  const smsLinkBaseUrl = inferSmsLinkBaseUrl(pageHref);
  const threadHref = `https://platform.openai.com/logs/${encodeURIComponent(threadId)}`;
  const customerLanguage =
    leadSummary?.customer_language ?? (locale ? localeToLanguageLabel(locale) : null);
  const subject = buildLeadEmailSubject({ leadSummary, threadTitle });
  const { smsDraft, emailDraftSubject, emailDraftBody } = buildOutreachDrafts({
    leadSummary,
    shopName: SHOP_NAME,
    shopPhoneDisplay: SHOP_PHONE_DISPLAY,
    shopPhoneDigits: SHOP_PHONE_DIGITS,
    shopAddress: SHOP_ADDRESS,
  });

  const defaultCallScriptPrompts = [
    "Can you confirm the year/make/model (or what item we're working on)?",
    'Can you send 2-4 photos (1 wide + 1-2 close-ups) so we can take a proper look?',
    "What's the best way to reach you if we have a quick follow-up question?",
  ];
  const callScriptPrompts = (leadSummary?.call_script_prompts ?? [])
    .map((prompt) => (typeof prompt === 'string' ? prompt.trim() : ''))
    .filter(Boolean)
    .slice(0, 3);
  while (callScriptPrompts.length < 3) {
    callScriptPrompts.push(defaultCallScriptPrompts[callScriptPrompts.length]);
  }

  let sourceLabel = 'craigs.autos';
  try {
    const url = pageHref ? new URL(pageHref) : null;
    if (url?.host) sourceLabel = url.host;
  } catch {
    // ignore
  }
  const attachments = extractAttachments(transcript);
  const inlineAttachmentsResolved = (
    await Promise.all(attachments.map((attachment) => fetchInlineAttachment(attachment)))
  ).filter((item): item is InlineAttachment => Boolean(item));
  const inlineAttachmentMap = new Map<string, InlineAttachment>(
    inlineAttachmentsResolved.map((attachment) => [attachment.sourceUrl, attachment])
  );

  // Gmail often strips `sms:` hrefs, so we generate an https:// token link that resolves into
  // {to_phone, body} and then opens Messages locally.
  const smsCustomerLink = customerPhone
    ? await createSmsLinkUrl({
        threadId,
        kind: 'customer',
        toPhone: customerPhone,
        body: smsDraft,
        baseUrl: smsLinkBaseUrl,
      })
    : null;

  const emailDraftHref = customerEmail
    ? mailtoWithDraft(customerEmail, emailDraftSubject, emailDraftBody)
    : null;

  const transcriptLines = transcript.map((line) => {
    const when = formatTimestamp(line.created_at);
    return `[${when}] ${line.speaker}: ${line.text}`;
  });

  const bodyParts: string[] = [`New chat lead from ${sourceLabel}`, ''];

  if (leadSummary) {
    bodyParts.push('At a glance');
    if (leadSummary.customer_name) bodyParts.push(`Customer: ${leadSummary.customer_name}`);
    if (customerPhone) bodyParts.push(`Phone: ${customerPhone}`);
    if (customerEmail) bodyParts.push(`Email: ${customerEmail}`);
    if (leadSummary.customer_location) bodyParts.push(`Location: ${leadSummary.customer_location}`);
    if (leadSummary.vehicle) bodyParts.push(`Vehicle: ${leadSummary.vehicle}`);
    if (leadSummary.project) bodyParts.push(`Project: ${leadSummary.project}`);
    if (leadSummary.timeline) bodyParts.push(`Timeline: ${leadSummary.timeline}`);
    bodyParts.push('');
  }

  if (attribution) {
    bodyParts.push('Attribution');
    if (attribution.device_type) bodyParts.push(`Device: ${attribution.device_type}`);
    if (attribution.gclid) bodyParts.push(`GCLID: ${attribution.gclid}`);
    if (attribution.gbraid) bodyParts.push(`GBRAID: ${attribution.gbraid}`);
    if (attribution.wbraid) bodyParts.push(`WBRAID: ${attribution.wbraid}`);
    if (attribution.utm_source || attribution.utm_medium || attribution.utm_campaign) {
      const utm = [
        attribution.utm_source ? `utm_source=${attribution.utm_source}` : null,
        attribution.utm_medium ? `utm_medium=${attribution.utm_medium}` : null,
        attribution.utm_campaign ? `utm_campaign=${attribution.utm_campaign}` : null,
        attribution.utm_term ? `utm_term=${attribution.utm_term}` : null,
        attribution.utm_content ? `utm_content=${attribution.utm_content}` : null,
      ]
        .filter(Boolean)
        .join(' | ');
      if (utm) bodyParts.push(`UTM: ${utm}`);
    }
    if (attribution.landing_page) bodyParts.push(`Landing page: ${attribution.landing_page}`);
    if (attribution.referrer) bodyParts.push(`Referrer: ${attribution.referrer}`);
    if (attribution.first_touch_ts) bodyParts.push(`First touch: ${attribution.first_touch_ts}`);
    if (attribution.last_touch_ts) bodyParts.push(`Last touch: ${attribution.last_touch_ts}`);
    bodyParts.push('');
  }

  if (attachments.length) {
    bodyParts.push(`Photos/attachments (${attachments.length})`);
    bodyParts.push(
      attachments
        .map((att) => `- ${att.name}${att.mime ? ` (${att.mime})` : ''}: ${att.url}`)
        .join('\n')
    );
    bodyParts.push('');
  }

  if (leadSummary?.summary) {
    bodyParts.push('Summary');
    bodyParts.push(leadSummary.summary);
    bodyParts.push('');
  }

  if (leadSummary?.next_steps?.length) {
    bodyParts.push('Suggested next steps');
    bodyParts.push(formatListText(leadSummary.next_steps, '- '));
    bodyParts.push('');
  }

  if (leadSummary?.follow_up_questions?.length) {
    bodyParts.push('Follow-up questions');
    bodyParts.push(formatListText(leadSummary.follow_up_questions, '- '));
    bodyParts.push('');
  }

  if (callScriptPrompts.length) {
    bodyParts.push('Call script (3 prompts)');
    bodyParts.push(formatListText(callScriptPrompts, '- '));
    bodyParts.push('');
  }

  bodyParts.push('Drafts');
  if (smsCustomerLink) bodyParts.push(`Text customer link:\n${smsCustomerLink}`);
  if (customerPhone) bodyParts.push(`Text message:\n${smsDraft}`);
  if (customerEmail) {
    bodyParts.push(`Email subject:\n${emailDraftSubject}`);
    bodyParts.push(`Email draft:\n${emailDraftBody}`);
  }
  bodyParts.push('');

  bodyParts.push('Transcript');
  bodyParts.push('');
  bodyParts.push(...transcriptLines);
  bodyParts.push('');

  bodyParts.push('Diagnostics');
  bodyParts.push(`Thread: ${threadId}`);
  bodyParts.push(`OpenAI logs: ${threadHref}`);
  bodyParts.push(`Trigger: ${reason}`);
  bodyParts.push(`Chat user: ${chatUser}`);
  if (leadSummary?.missing_info?.length) {
    bodyParts.push(`Missing: ${leadSummary.missing_info.join(', ')}`);
  }
  if (locale) bodyParts.push(`Locale: ${locale}`);
  if (customerLanguage) bodyParts.push(`Language: ${customerLanguage}`);
  if (pageHref) bodyParts.push(`Page: ${pageHref}`);

  const bodyText = bodyParts.join('\n\n');

  const atAGlanceRows: Array<{ label: string; value: string; href?: string | null }> = [];
  if (leadSummary?.customer_name) atAGlanceRows.push({ label: 'Customer', value: leadSummary.customer_name });
  if (customerPhone) atAGlanceRows.push({ label: 'Phone', value: customerPhone, href: customerTelHref });
  if (customerEmail) atAGlanceRows.push({ label: 'Email', value: customerEmail, href: customerMailHref });
  if (leadSummary?.customer_location) atAGlanceRows.push({ label: 'Location', value: leadSummary.customer_location });
  if (leadSummary?.vehicle) atAGlanceRows.push({ label: 'Vehicle', value: leadSummary.vehicle });
  if (leadSummary?.project) atAGlanceRows.push({ label: 'Project', value: leadSummary.project });
  if (leadSummary?.timeline) atAGlanceRows.push({ label: 'Timeline', value: leadSummary.timeline });
  if (attachments.length) atAGlanceRows.push({ label: 'Photos', value: String(attachments.length) });

  const diagnosticRows: Array<{ label: string; value: string; href?: string | null }> = [];
  if (locale) diagnosticRows.push({ label: 'Locale', value: locale });
  if (customerLanguage) diagnosticRows.push({ label: 'Language', value: customerLanguage });
  if (pageHref) diagnosticRows.push({ label: 'Page', value: pageHref, href: pageHref });
  diagnosticRows.push({ label: 'Thread', value: threadId, href: threadHref });
  if (reason) diagnosticRows.push({ label: 'Trigger', value: reason });
  if (chatUser) diagnosticRows.push({ label: 'Chat user', value: chatUser });
  if (leadSummary?.missing_info?.length) {
    diagnosticRows.push({ label: 'Missing', value: leadSummary.missing_info.join(', ') });
  }

  const htmlAtAGlanceRows = atAGlanceRows
    .map(({ label, value, href }) => {
      const labelCell = `<td style="padding:6px 0;color:#6b7280;vertical-align:top;width:140px">${escapeHtml(
        label
      )}</td>`;
      const valueHtml = href
        ? `<a href="${escapeHtml(String(href))}" style="color:#141cff;text-decoration:none">${escapeHtml(
            value
          )}</a>`
        : escapeHtml(value);
      const valueCell = `<td style="padding:6px 0;color:#111827">${valueHtml}</td>`;
      return `<tr>${labelCell}${valueCell}</tr>`;
    })
    .join('');

  const htmlDiagnosticRows = diagnosticRows
    .map(({ label, value, href }) => {
      const labelCell = `<td style="padding:6px 0;color:#6b7280;vertical-align:top;width:140px">${escapeHtml(
        label
      )}</td>`;
      const valueHtml = href
        ? `<a href="${escapeHtml(String(href))}" style="color:#141cff;text-decoration:none">${escapeHtml(
            value
          )}</a>`
        : escapeHtml(value);
      const valueCell = `<td style="padding:6px 0;color:#111827">${valueHtml}</td>`;
      return `<tr>${labelCell}${valueCell}</tr>`;
    })
    .join('');

  const quickActions: Array<{ label: string; href: string }> = [];
  if (customerTelHref) quickActions.push({ label: 'Call customer', href: customerTelHref });
  if (smsCustomerLink) quickActions.push({ label: 'Text customer', href: smsCustomerLink });
  if (customerMailHref) quickActions.push({ label: 'Email customer', href: customerMailHref });
  if (emailDraftHref) quickActions.push({ label: 'Email draft', href: emailDraftHref });
  if (pageHref) quickActions.push({ label: 'Open page', href: pageHref });
  quickActions.push({ label: 'OpenAI logs', href: threadHref });

  const quickActionsHtml = quickActions
    .map(
      (action) =>
        `<a href="${escapeHtml(action.href)}" style="display:inline-block;margin:0 10px 10px 0;padding:10px 14px;border:1px solid #e5e7eb;border-radius:999px;background:#f9fafb;color:#111827;text-decoration:none;font-size:13px;line-height:1">${escapeHtml(
          action.label
        )}</a>`
    )
    .join('');

  const callScriptHtml = formatListHtml(callScriptPrompts);

  const attachmentsHtml = attachments.length
    ? `<div style="font-size:14px;font-weight:700;margin:0 0 10px">Photos/attachments (${attachments.length})</div>
       <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.5">
         ${attachments
           .map((att) => {
              const label = `${att.name}${att.mime ? ` (${att.mime})` : ''}`;
             const inline = inlineAttachmentMap.get(att.url);
             const preview = inline
               ? `<div style="margin:8px 0 18px"><img src="cid:${inline.contentId}" alt="${escapeHtml(
                   att.name
                 )}" style="max-width:100%;height:auto;border:1px solid #e5e7eb;border-radius:8px" /></div>`
               : '';
             return `<li style="margin:0 0 8px"><a href="${escapeHtml(att.url)}" style="color:#141cff;text-decoration:none">${escapeHtml(
                label
             )}</a></li>${preview}`;
           })
           .join('')}
       </ul>`
    : '';

  const draftsHtmlParts: string[] = [];
  if (customerPhone) {
    draftsHtmlParts.push(`<div style="margin:0 0 12px">
      <div style="font-size:13px;font-weight:700;margin:0 0 6px">Text message</div>
      <pre style="margin:0;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.4">${escapeHtml(
        smsDraft
      )}</pre>
    </div>`);
  }
  if (customerEmail) {
    draftsHtmlParts.push(`<div style="margin:0 0 12px">
      <div style="font-size:13px;font-weight:700;margin:0 0 6px">Email subject</div>
      <pre style="margin:0;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.4">${escapeHtml(
        emailDraftSubject
      )}</pre>
    </div>`);
    draftsHtmlParts.push(`<div>
      <div style="font-size:13px;font-weight:700;margin:0 0 6px">Email body</div>
      <pre style="margin:0;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.4">${escapeHtml(
        emailDraftBody
      )}</pre>
    </div>`);
  }
  const draftsHtml = draftsHtmlParts.join('');

  // Render the transcript in a "per message" layout, but keep the HTML lightweight.
  const transcriptHtml = transcript
    .map((line) => {
      const when = formatTimestamp(line.created_at);
      const speakerColor = line.speaker === 'Customer' ? '#111827' : '#141cff';
      return `[${escapeHtml(when)}] <strong style="color:${speakerColor}">${escapeHtml(
        line.speaker
      )}:</strong> ${linkifyTextToHtml(line.text)}`;
    })
    .join('<br/><br/>');

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
            <tr>
              <td style="padding:0 22px 18px">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Quick actions</div>
                <div>${quickActionsHtml || '<span style="color:#6b7280;font-size:13px">No actions available.</span>'}</div>
              </td>
            </tr>
            ${
              attachments.length
                ? `<tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                ${attachmentsHtml}
              </td>
            </tr>`
                : ''
            }
            ${
              leadSummary
                ? `<tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Summary</div>
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
            </tr>`
                : ''
            }
            <tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Call script (3 prompts)</div>
                ${callScriptHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Drafts</div>
                <div style="font-size:12px;color:#6b7280;margin:0 0 10px">Copy/paste (edit as needed).</div>
                ${draftsHtml || '<span style=\"color:#6b7280;font-size:13px\">No drafts available.</span>'}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Transcript</div>
                <div style="font-size:13px;line-height:1.5;color:#111827;white-space:pre-wrap;word-break:break-word">${transcriptHtml}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Diagnostics</div>
                <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px">
                  ${htmlDiagnosticRows || '<tr><td style=\"color:#6b7280\">No diagnostics available.</td></tr>'}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const rawMessage = buildRawEmail({
    from: leadFromEmail,
    to: leadToEmail,
    replyTo: customerEmail ?? null,
    subject,
    textBody: bodyText,
    htmlBody: html,
    attachments: inlineAttachmentsResolved,
  });

  const result = await ses.send(
    new SendRawEmailCommand({
      Source: leadFromEmail,
      RawMessage: { Data: rawMessage },
      Destinations: [leadToEmail],
    })
  );
  return result?.MessageId ?? null;
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
  const reason = typeof payload.reason === 'string' ? payload.reason : 'auto';
  const attribution = sanitizeAttribution((payload as any)?.attribution);

  try {
    // Fast path: if we've already emailed this thread, don't re-fetch transcript or re-run summaries.
    const now = nowEpochSeconds();
    if (leadDedupeDb && leadDedupeTableName) {
      try {
        const record = await getLeadDedupeRecord(threadId);
        if (record?.status === 'sent') {
          return json(200, {
            ok: true,
            sent: true,
            reason: 'already_sent',
            sent_at: record.sent_at ?? null,
          });
        }
        const lockExpiresAt = typeof record?.lock_expires_at === 'number' ? record.lock_expires_at : 0;
        if (record?.status === 'sending' && lockExpiresAt > now) {
          return json(200, { ok: true, sent: false, reason: 'in_progress' });
        }
        if (record?.status === 'error' && lockExpiresAt > now) {
          return json(200, { ok: true, sent: false, reason: 'cooldown' });
        }
      } catch (err: any) {
        console.error('Lead dedupe read failed', err?.name, err?.message);
      }
    }

    const { threadTitle, threadUser, lines } = await buildTranscript(threadId);

    // Avoid sending empty transcripts (e.g., user opened chat but never messaged).
    const hasCustomerMessage = lines.some((line) => line.speaker === 'Customer');
    if (!hasCustomerMessage) {
      return json(200, { ok: true, sent: false, reason: 'empty_thread' });
    }

    const detectedContact = extractCustomerContact(lines);
    if (!detectedContact.email && !detectedContact.phone) {
      // Lead intake without a way to contact the customer is not actionable.
      return json(200, { ok: true, sent: false, reason: 'missing_contact' });
    }

    if (reason !== 'auto') {
      const lastMessageAt = latestActivityEpochSeconds(lines);
      const currentEpoch = nowEpochSeconds();
      if (lastMessageAt !== null && currentEpoch - lastMessageAt < LEAD_IDLE_DELAY_SECONDS) {
        return json(200, {
          ok: true,
          sent: false,
          reason: 'not_idle',
          last_activity_at: lastMessageAt,
          idle_seconds: LEAD_IDLE_DELAY_SECONDS,
          seconds_since_last_activity: currentEpoch - lastMessageAt,
        });
      }
    }

    const leadSummary = await generateLeadSummary({
      locale,
      pageUrl,
      transcript: lines,
    });

    const shouldSendNow =
      // All completion paths should meet a minimum quality bar before sending.
      // This prevents premature lead emails from short pauses, explicit closes,
      // or pagehide events from firing incomplete summaries.
      leadSummary?.handoff_ready === true;

    if (!shouldSendNow) {
      return json(200, {
        ok: true,
        sent: false,
        reason: leadSummary?.handoff_reason || 'not_ready',
        missing_info: leadSummary?.missing_info ?? [],
      });
    }

    // If the model failed to extract contact details, fall back to simple detection from the transcript.
    const hydratedLeadSummary =
      leadSummary && (!leadSummary.customer_email || !leadSummary.customer_phone)
        ? {
            ...leadSummary,
            customer_email: leadSummary.customer_email ?? detectedContact.email,
            customer_phone: leadSummary.customer_phone ?? detectedContact.phone,
          }
        : leadSummary;

    // Acquire a per-thread lease before sending so we never email the shop twice for the same thread,
    // even if multiple devices or tab lifecycle events trigger this endpoint concurrently.
    const lease = await acquireLeadSendLease({ threadId, reason });
    if (!lease.acquired) {
      if (lease.record?.status === 'sent') {
        return json(200, {
          ok: true,
          sent: true,
          reason: 'already_sent',
          sent_at: lease.record.sent_at ?? null,
        });
      }
      const lockExpiresAt =
        typeof lease.record?.lock_expires_at === 'number' ? lease.record.lock_expires_at : 0;
      if (lease.record?.status === 'error' && lockExpiresAt > nowEpochSeconds()) {
        return json(200, { ok: true, sent: false, reason: 'cooldown' });
      }
      return json(200, { ok: true, sent: false, reason: 'in_progress' });
    }

    try {
      const messageId = await sendTranscriptEmail({
        threadId,
        locale,
        pageUrl,
        chatUser: threadUser ?? chatUser,
        reason,
        threadTitle,
        transcript: lines,
        leadSummary: hydratedLeadSummary,
        attribution,
      });
      try {
        await markLeadSent({ threadId, leaseId: lease.leaseId, messageId });
      } catch (err: any) {
        console.error('Lead dedupe mark sent failed', err?.name, err?.message);
      }

      try {
        const detectedContact = extractCustomerContact(lines);
        const customerPhone =
          hydratedLeadSummary?.customer_phone ?? detectedContact.phone ?? null;
        const customerEmail =
          hydratedLeadSummary?.customer_email ?? detectedContact.email ?? null;
        await storeLeadAttribution({
          threadId,
          locale,
          pageUrl,
          chatUser: threadUser ?? chatUser,
          reason,
          attribution,
          customerPhone,
          customerEmail,
        });
      } catch (err: any) {
        console.error('Lead attribution write failed', err?.name, err?.message);
      }
    } catch (err: any) {
      try {
        await markLeadError({
          threadId,
          leaseId: lease.leaseId,
          errorMessage: String(err?.message ?? err ?? 'Failed to send lead email'),
        });
      } catch (markErr: any) {
        console.error('Lead dedupe mark error failed', markErr?.name, markErr?.message);
      }
      throw err;
    }

    return json(200, { ok: true, sent: true, reason });
  } catch (err: any) {
    console.error('Lead email failed', err?.name, err?.message);
    return json(500, { error: 'Failed to send lead email' });
  }
};
