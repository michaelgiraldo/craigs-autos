import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { decodeBody, emptyResponse, getHttpMethod, jsonResponse } from '../_shared/http.ts';
import { asObject } from '../_shared/safe.ts';

const LEAD_RECORD_TTL_DAYS = 180;

const leadSignalEnvSchema = z.object({
  LEAD_EVENTS_TABLE_NAME: z.string().trim().min(1),
  LEAD_CASES_TABLE_NAME: z.string().trim().min(1),
});

const allowedEventSchema = z.enum([
  'lead_click_to_call',
  'lead_click_to_text',
  'lead_click_email',
  'lead_click_directions',
]);

const leadSignalPayloadSchema = z.looseObject({
  event: z.string(),
  pageUrl: z.string().nullable().optional(),
  user: z.string().nullable().optional(),
  locale: z.string().nullable().optional(),
  clickUrl: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  lead_intent_type: z.string().nullable().optional(),
  attribution: z.unknown().optional(),
});

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
type LeadIntentType = 'call' | 'text' | 'email' | 'directions';

type LeadSignalAttribution = {
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  msclkid: string | null;
  fbclid: string | null;
  ttclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  first_touch_ts: string | null;
  last_touch_ts: string | null;
  landing_page: string | null;
  referrer: string | null;
  referrer_host: string | null;
  device_type: 'mobile' | 'desktop' | null;
  source_platform: string | null;
  click_id_type: string | null;
};

type UrlAttribution = Pick<
  LeadSignalAttribution,
  | 'gclid'
  | 'gbraid'
  | 'wbraid'
  | 'msclkid'
  | 'fbclid'
  | 'ttclid'
  | 'utm_source'
  | 'utm_medium'
  | 'utm_campaign'
  | 'utm_term'
  | 'utm_content'
>;

type LeadSignalDeps = {
  configValid: boolean;
  nowEpochSeconds: () => number;
  writeEventRecord: (record: Record<string, unknown>) => Promise<void>;
  writeCaseRecord: (record: Record<string, unknown>) => Promise<void>;
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

function normalizeDeviceType(value: unknown): 'mobile' | 'desktop' | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'mobile' || normalized === 'desktop') return normalized;
  return null;
}

function extractHostname(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

function normalizeToken(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function hasPaidMedium(value: string | null | undefined): boolean {
  return ['cpc', 'ppc', 'paid', 'paid_search', 'paid-social', 'display'].includes(
    normalizeToken(value),
  );
}

function getClickIdType(attribution: LeadSignalAttribution): string | null {
  if (attribution.gclid) return 'gclid';
  if (attribution.gbraid) return 'gbraid';
  if (attribution.wbraid) return 'wbraid';
  if (attribution.msclkid) return 'msclkid';
  if (attribution.fbclid) return 'fbclid';
  if (attribution.ttclid) return 'ttclid';
  return null;
}

function inferSourcePlatform(attribution: LeadSignalAttribution): string | null {
  if (attribution.gclid || attribution.gbraid || attribution.wbraid) return 'google_ads';
  if (attribution.msclkid) return 'microsoft_ads';
  if (attribution.fbclid) return 'meta';
  if (attribution.ttclid) return 'tiktok';

  const utmSource = normalizeToken(attribution.utm_source);
  const utmMedium = normalizeToken(attribution.utm_medium);
  const referrerHost = normalizeToken(attribution.referrer_host);

  if (utmSource === 'yelp') return 'yelp';
  if (utmSource === 'reddit') return 'reddit';
  if (utmSource === 'tiktok') return 'tiktok';
  if (utmSource === 'facebook' || utmSource === 'instagram' || utmSource === 'meta') return 'meta';
  if (utmSource === 'bing' || utmSource === 'microsoft') {
    return hasPaidMedium(utmMedium) ? 'microsoft_ads' : 'bing';
  }
  if (utmSource === 'google') {
    return hasPaidMedium(utmMedium) ? 'google_ads' : 'google';
  }
  if (utmSource) return utmSource;

  if (referrerHost.includes('google.')) return 'organic_google';
  if (referrerHost.includes('yelp.')) return 'yelp';
  if (referrerHost.includes('bing.com')) return 'organic_bing';
  if (referrerHost.includes('facebook.com') || referrerHost.includes('instagram.com'))
    return 'meta';
  if (referrerHost.includes('reddit.com')) return 'reddit';
  if (referrerHost.includes('tiktok.com')) return 'tiktok';
  if (!referrerHost) return 'direct';
  return 'referral';
}

function sanitizeAttribution(input: unknown): LeadSignalAttribution | null {
  const data = asObject(input);
  if (!data) return null;
  const payload: LeadSignalAttribution = {
    gclid: normalizeValue(data.gclid, 128),
    gbraid: normalizeValue(data.gbraid, 128),
    wbraid: normalizeValue(data.wbraid, 128),
    msclkid: normalizeValue(data.msclkid, 128),
    fbclid: normalizeValue(data.fbclid, 128),
    ttclid: normalizeValue(data.ttclid, 128),
    utm_source: normalizeValue(data.utm_source, 128),
    utm_medium: normalizeValue(data.utm_medium, 128),
    utm_campaign: normalizeValue(data.utm_campaign, 200),
    utm_term: normalizeValue(data.utm_term, 200),
    utm_content: normalizeValue(data.utm_content, 200),
    first_touch_ts: normalizeValue(data.first_touch_ts, 64),
    last_touch_ts: normalizeValue(data.last_touch_ts, 64),
    landing_page: normalizeValue(data.landing_page, 300),
    referrer: normalizeValue(data.referrer, 300),
    referrer_host: normalizeValue(data.referrer_host, 200),
    device_type: normalizeDeviceType(data.device_type),
    source_platform: normalizeValue(data.source_platform, 80),
    click_id_type: normalizeValue(data.click_id_type, 40),
  };

  if (!payload.referrer_host) {
    payload.referrer_host = extractHostname(payload.referrer);
  }
  if (!payload.click_id_type) {
    payload.click_id_type = getClickIdType(payload);
  }
  if (!payload.source_platform) {
    payload.source_platform = inferSourcePlatform(payload);
  }

  const hasAny = Object.values(payload).some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
  return hasAny ? payload : null;
}

function attributionFromUrl(urlValue: unknown): UrlAttribution | null {
  const raw = normalizeValue(urlValue, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw, 'https://craigs.autos');
    const payload: UrlAttribution = {
      gclid: normalizeValue(url.searchParams.get('gclid'), 128),
      gbraid: normalizeValue(url.searchParams.get('gbraid'), 128),
      wbraid: normalizeValue(url.searchParams.get('wbraid'), 128),
      msclkid: normalizeValue(url.searchParams.get('msclkid'), 128),
      fbclid: normalizeValue(url.searchParams.get('fbclid'), 128),
      ttclid: normalizeValue(url.searchParams.get('ttclid'), 128),
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
  const pickMergedValue = (key: keyof UrlAttribution): string | null =>
    base?.[key] ?? fromPage?.[key] ?? fromClick?.[key] ?? null;

  const merged: LeadSignalAttribution = {
    gclid: pickMergedValue('gclid'),
    gbraid: pickMergedValue('gbraid'),
    wbraid: pickMergedValue('wbraid'),
    msclkid: pickMergedValue('msclkid'),
    fbclid: pickMergedValue('fbclid'),
    ttclid: pickMergedValue('ttclid'),
    utm_source: pickMergedValue('utm_source'),
    utm_medium: pickMergedValue('utm_medium'),
    utm_campaign: pickMergedValue('utm_campaign'),
    utm_term: pickMergedValue('utm_term'),
    utm_content: pickMergedValue('utm_content'),
    first_touch_ts: base?.first_touch_ts ?? null,
    last_touch_ts: base?.last_touch_ts ?? null,
    landing_page: base?.landing_page ?? null,
    referrer: base?.referrer ?? null,
    referrer_host: base?.referrer_host ?? extractHostname(base?.referrer ?? null),
    device_type: base?.device_type ?? null,
    source_platform: base?.source_platform ?? null,
    click_id_type: base?.click_id_type ?? null,
  };

  merged.click_id_type = getClickIdType(merged);
  merged.source_platform = inferSourcePlatform(merged);

  const hasAny = Object.values(merged).some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
  return hasAny ? merged : null;
}

function inferLeadIntentType(eventName: z.infer<typeof allowedEventSchema>): LeadIntentType {
  if (eventName === 'lead_click_to_call') return 'call';
  if (eventName === 'lead_click_to_text') return 'text';
  if (eventName === 'lead_click_email') return 'email';
  return 'directions';
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
    const leadIntentType = inferLeadIntentType(eventName);
    const attribution = mergedAttribution(payload.attribution, payload.pageUrl, payload.clickUrl);
    const now = deps.nowEpochSeconds();
    const ttl = ttlSecondsFromNow(now, LEAD_RECORD_TTL_DAYS);

    const commonFields = {
      created_at: now,
      lead_method: eventName,
      lead_reason: eventName,
      lead_intent_type: leadIntentType,
      locale: typeof payload.locale === 'string' ? payload.locale : null,
      page_url: typeof payload.pageUrl === 'string' ? payload.pageUrl : null,
      user_id: typeof payload.user === 'string' ? payload.user : null,
      click_url: typeof payload.clickUrl === 'string' ? payload.clickUrl : null,
      provider: typeof payload.provider === 'string' ? payload.provider : null,
      ...attribution,
    };

    await deps.writeEventRecord({
      event_id: randomUUID(),
      event_name: eventName,
      ttl,
      ...commonFields,
    });

    await deps.writeCaseRecord({
      lead_id: randomUUID(),
      thread_id: null,
      qualified: false,
      qualified_at: null,
      uploaded_google_ads: false,
      uploaded_google_ads_at: null,
      customer_phone: null,
      customer_email: null,
      ttl,
      ...commonFields,
    });

    return json(200, { ok: true });
  };
}

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

const parsedEnv = leadSignalEnvSchema.safeParse(process.env);
const runtimeEventsTableName = parsedEnv.success ? parsedEnv.data.LEAD_EVENTS_TABLE_NAME : '';
const runtimeCasesTableName = parsedEnv.success ? parsedEnv.data.LEAD_CASES_TABLE_NAME : '';
const runtimeDb =
  runtimeEventsTableName && runtimeCasesTableName
    ? DynamoDBDocumentClient.from(new DynamoDBClient({}))
    : null;

export const handler = createLeadSignalHandler({
  configValid: Boolean(
    parsedEnv.success && runtimeDb && runtimeEventsTableName && runtimeCasesTableName,
  ),
  nowEpochSeconds,
  writeEventRecord: async (record) => {
    if (!runtimeDb || !runtimeEventsTableName) return;
    await runtimeDb.send(
      new PutCommand({
        TableName: runtimeEventsTableName,
        Item: record,
      }),
    );
  },
  writeCaseRecord: async (record) => {
    if (!runtimeDb || !runtimeCasesTableName) return;
    await runtimeDb.send(
      new PutCommand({
        TableName: runtimeCasesTableName,
        Item: record,
      }),
    );
  },
});
