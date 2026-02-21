import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { decodeBody, emptyResponse, getHttpMethod, jsonResponse } from '../_shared/http.ts';

const LEAD_ATTRIBUTION_TTL_DAYS = 180;

const leadSignalEnvSchema = z.object({
  LEAD_ATTRIBUTION_TABLE_NAME: z.string().trim().min(1),
});

const allowedEventSchema = z.enum([
  'lead_ad_landing',
  'lead_click_to_call',
  'lead_click_to_text',
  'lead_click_email',
  'lead_click_directions',
]);

const leadSignalPayloadSchema = z
  .object({
    event: z.string(),
    pageUrl: z.string().optional(),
    user: z.string().optional(),
    locale: z.string().optional(),
    clickUrl: z.string().optional(),
    provider: z.string().optional(),
    attribution: z.unknown().optional(),
  })
  .passthrough();

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

type LeadSignalRequest = z.infer<typeof leadSignalPayloadSchema>;

type LeadSignalDeps = {
  configValid: boolean;
  nowEpochSeconds: () => number;
  writeRecord: (record: Record<string, unknown>) => Promise<void>;
};

function json(statusCode: number, body: unknown): LambdaResult {
  return jsonResponse(statusCode, body);
}

function ttlSecondsFromNow(nowEpoch: number, days: number): number {
  return nowEpoch + days * 24 * 60 * 60;
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
    typeof input.device_type === 'string' &&
    (input.device_type === 'mobile' || input.device_type === 'desktop')
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
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
  return hasAny ? payload : null;
}

function attributionFromUrl(urlValue: unknown) {
  const raw = normalizeValue(urlValue, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw, 'https://craigs.autos');
    const payload = {
      gclid: normalizeValue(url.searchParams.get('gclid'), 128),
      gbraid: normalizeValue(url.searchParams.get('gbraid'), 128),
      wbraid: normalizeValue(url.searchParams.get('wbraid'), 128),
      utm_source: normalizeValue(url.searchParams.get('utm_source'), 128),
      utm_medium: normalizeValue(url.searchParams.get('utm_medium'), 128),
      utm_campaign: normalizeValue(url.searchParams.get('utm_campaign'), 200),
      utm_term: normalizeValue(url.searchParams.get('utm_term'), 200),
      utm_content: normalizeValue(url.searchParams.get('utm_content'), 200),
    };
    const hasAny = Object.values(payload).some(
      (value) => typeof value === 'string' && value.trim().length > 0,
    );
    return hasAny ? payload : null;
  } catch {
    return null;
  }
}

function mergedAttribution(inputAttribution: unknown, pageUrl: unknown, clickUrl: unknown) {
  const base = sanitizeAttribution(inputAttribution);
  const fromPage = attributionFromUrl(pageUrl);
  const fromClick = attributionFromUrl(clickUrl);

  const merged = {
    ...(base || {}),
    gclid:
      (base && base.gclid) ||
      (fromPage && fromPage.gclid) ||
      (fromClick && fromClick.gclid) ||
      null,
    gbraid:
      (base && base.gbraid) ||
      (fromPage && fromPage.gbraid) ||
      (fromClick && fromClick.gbraid) ||
      null,
    wbraid:
      (base && base.wbraid) ||
      (fromPage && fromPage.wbraid) ||
      (fromClick && fromClick.wbraid) ||
      null,
    utm_source:
      (base && base.utm_source) ||
      (fromPage && fromPage.utm_source) ||
      (fromClick && fromClick.utm_source) ||
      null,
    utm_medium:
      (base && base.utm_medium) ||
      (fromPage && fromPage.utm_medium) ||
      (fromClick && fromClick.utm_medium) ||
      null,
    utm_campaign:
      (base && base.utm_campaign) ||
      (fromPage && fromPage.utm_campaign) ||
      (fromClick && fromClick.utm_campaign) ||
      null,
    utm_term:
      (base && base.utm_term) ||
      (fromPage && fromPage.utm_term) ||
      (fromClick && fromClick.utm_term) ||
      null,
    utm_content:
      (base && base.utm_content) ||
      (fromPage && fromPage.utm_content) ||
      (fromClick && fromClick.utm_content) ||
      null,
  };

  const hasAny = Object.values(merged).some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
  return hasAny ? merged : null;
}

export function createLeadSignalHandler(deps: LeadSignalDeps) {
  return async (event: LambdaEvent): Promise<LambdaResult> => {
    const method = getHttpMethod(event);

    if (method === 'OPTIONS') {
      return emptyResponse(204);
    }

    if (method !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }

    if (!deps.configValid) {
      return json(500, { error: 'Server missing configuration' });
    }

    let payload: LeadSignalRequest = { event: '' };
    try {
      const body = decodeBody(event);
      const parsed = body ? JSON.parse(body) : {};
      const result = leadSignalPayloadSchema.safeParse(
        parsed && typeof parsed === 'object' ? parsed : {},
      );
      if (!result.success) return json(400, { error: 'Invalid request payload' });
      payload = result.data;
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    const eventNameResult = allowedEventSchema.safeParse(payload.event);
    if (!eventNameResult.success) {
      return json(400, { error: 'Invalid event' });
    }
    const eventName = eventNameResult.data;

    const now = deps.nowEpochSeconds();
    const record = {
      lead_id: randomUUID(),
      created_at: now,
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
      ttl: ttlSecondsFromNow(now, LEAD_ATTRIBUTION_TTL_DAYS),
      ...mergedAttribution(payload.attribution, payload.pageUrl, payload.clickUrl),
    };

    await deps.writeRecord(record);
    return json(200, { ok: true });
  };
}

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

const parsedEnv = leadSignalEnvSchema.safeParse(process.env);
const runtimeTableName = parsedEnv.success ? parsedEnv.data.LEAD_ATTRIBUTION_TABLE_NAME : '';
const runtimeDb = runtimeTableName ? DynamoDBDocumentClient.from(new DynamoDBClient({})) : null;

export const handler = createLeadSignalHandler({
  configValid: Boolean(parsedEnv.success && runtimeDb && runtimeTableName),
  nowEpochSeconds,
  writeRecord: async (record) => {
    if (!runtimeDb || !runtimeTableName) return;
    await runtimeDb.send(
      new PutCommand({
        TableName: runtimeTableName,
        Item: record,
      }),
    );
  },
});
