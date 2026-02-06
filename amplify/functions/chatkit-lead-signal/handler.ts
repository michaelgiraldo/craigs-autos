import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';

const leadAttributionTableName = process.env.LEAD_ATTRIBUTION_TABLE_NAME;
const leadAttributionDb =
  leadAttributionTableName && leadAttributionTableName.trim()
    ? DynamoDBDocumentClient.from(new DynamoDBClient({}))
    : null;

const LEAD_ATTRIBUTION_TTL_DAYS = 180;

const ALLOWED_EVENTS = new Set([
  'lead_click_to_call',
  'lead_click_to_text',
  'lead_click_email',
  'lead_click_directions',
]);

type LambdaEvent = {
  headers?: Record<string, string | undefined> | null;
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

type LeadSignalRequest = {
  event?: unknown;
  pageUrl?: unknown;
  user?: unknown;
  locale?: unknown;
  clickUrl?: unknown;
  provider?: unknown;
  attribution?: unknown;
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

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function ttlSecondsFromNow(days: number): number {
  return nowEpochSeconds() + days * 24 * 60 * 60;
}

function normalizeValue(value: unknown, maxLen = 256): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen);
}

function sanitizeAttribution(input: any) {
  if (!input || typeof input !== 'object') return null;
  const deviceType =
    typeof input.device_type === 'string' && (input.device_type === 'mobile' || input.device_type === 'desktop')
      ? input.device_type
      : null;
  const payload = {
    gclid: normalizeValue(input.gclid, 128),
    gbraid: normalizeValue(input.gbraid, 128),
    wbraid: normalizeValue(input.wbraid, 128),
    utm_source: normalizeValue(input.utm_source, 128),
    utm_medium: normalizeValue(input.utm_medium, 128),
    utm_campaign: normalizeValue(input.utm_campaign, 200),
    utm_term: normalizeValue(input.utm_term, 200),
    utm_content: normalizeValue(input.utm_content, 200),
    first_touch_ts: normalizeValue(input.first_touch_ts, 64),
    last_touch_ts: normalizeValue(input.last_touch_ts, 64),
    landing_page: normalizeValue(input.landing_page, 300),
    referrer: normalizeValue(input.referrer, 300),
    device_type: deviceType,
  };
  const hasAny = Object.values(payload).some(
    (value) => typeof value === 'string' && value.trim().length > 0
  );
  return hasAny ? payload : null;
}

export const handler = async (event: LambdaEvent): Promise<LambdaResult> => {
  const method = event?.requestContext?.http?.method ?? event?.httpMethod;

  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {},
      body: '',
    };
  }

  if (method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  if (!leadAttributionDb || !leadAttributionTableName) {
    return json(500, { error: 'Server missing configuration' });
  }

  let payload: LeadSignalRequest = {};
  try {
    const body = decodeBody(event);
    const parsed = body ? JSON.parse(body) : {};
    payload = parsed && typeof parsed === 'object' ? (parsed as LeadSignalRequest) : {};
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const eventName = typeof payload.event === 'string' ? payload.event : '';
  if (!ALLOWED_EVENTS.has(eventName)) {
    return json(400, { error: 'Invalid event' });
  }

  const record = {
    lead_id: randomUUID(),
    created_at: nowEpochSeconds(),
    lead_method: eventName,
    lead_reason: eventName,
    locale: typeof payload.locale === 'string' ? payload.locale : null,
    page_url: typeof payload.pageUrl === 'string' ? payload.pageUrl : null,
    user_id: typeof payload.user === 'string' ? payload.user : null,
    click_url: typeof payload.clickUrl === 'string' ? payload.clickUrl : null,
    provider: typeof payload.provider === 'string' ? payload.provider : null,
    qualified: false,
    qualified_at: null,
    uploaded: false,
    uploaded_at: null,
    ttl: ttlSecondsFromNow(LEAD_ATTRIBUTION_TTL_DAYS),
    ...sanitizeAttribution(payload.attribution),
  };

  await leadAttributionDb.send(
    new PutCommand({
      TableName: leadAttributionTableName,
      Item: record,
    })
  );

  return json(200, { ok: true });
};
