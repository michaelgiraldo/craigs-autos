export const STORAGE_KEY = 'craigs_attribution_v1';
export const USER_STORAGE_KEY = 'chatkit-user-id';
export const JOURNEY_STORAGE_KEY = 'craigs_lead_journey_v1';
const JOURNEY_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const CLICK_KEYS = ['gclid', 'gbraid', 'wbraid', 'msclkid', 'fbclid', 'ttclid'] as const;
export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

type ClickKey = (typeof CLICK_KEYS)[number];
type UtmKey = (typeof UTM_KEYS)[number];

export type TouchRecord = Partial<Record<ClickKey | UtmKey | 'ts' | 'landing_page', string>>;

export type StoredAttributionState = {
  first_touch?: TouchRecord | null;
  last_touch?: TouchRecord | null;
  landing_page?: string | null;
  referrer?: string | null;
};

type StoredJourneyState = {
  journey_id?: string | null;
  source_fingerprint?: string | null;
  started_at_ms?: number | null;
  updated_at_ms?: number | null;
};

export type AttributionPayload = {
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
  device_type: 'mobile' | 'desktop' | null;
  referrer_host: string | null;
  source_platform: string | null;
  acquisition_class: 'paid' | 'organic' | 'owned' | 'referral' | 'direct' | null;
  click_id_type: string | null;
};

export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readStorage(): StoredAttributionState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as StoredAttributionState;
  } catch {
    return null;
  }
}

function readJourneyStorage(): StoredJourneyState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(JOURNEY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as StoredJourneyState;
  } catch {
    return null;
  }
}

function writeJourneyStorage(value: StoredJourneyState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage failures.
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie ? document.cookie.split(';') : [];
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split('=');
    if (key && key.trim() === name) {
      return decodeURIComponent(rest.join('=') || '').trim() || null;
    }
  }
  return null;
}

function pickValue(obj: unknown, key: string): string | null {
  const value =
    obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getDeviceType(): 'mobile' | 'desktop' | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.matchMedia('(max-width: 900px)').matches ? 'mobile' : 'desktop';
  } catch {
    return null;
  }
}

function getReferrerHost(value: string | null): string | null {
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

function createJourneyId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `journey_${crypto.randomUUID()}`;
  }
  return `journey_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function hasPaidMedium(value: string | null | undefined): boolean {
  return ['cpc', 'ppc', 'paid', 'paid_search', 'paid-social', 'display'].includes(
    normalizeToken(value),
  );
}

function isEmailSource(value: string): boolean {
  return value === 'email' || value === 'newsletter';
}

function isSmsSource(value: string): boolean {
  return value === 'sms' || value === 'text';
}

function isGoogleBusinessProfileSource(value: string): boolean {
  return value === 'google_business_profile' || value === 'google-business-profile' || value === 'gbp';
}

function getClickIdType(payload: AttributionPayload): string | null {
  if (payload.gclid) return 'gclid';
  if (payload.gbraid) return 'gbraid';
  if (payload.wbraid) return 'wbraid';
  if (payload.msclkid) return 'msclkid';
  if (payload.fbclid) return 'fbclid';
  if (payload.ttclid) return 'ttclid';
  return null;
}

function inferSourcePlatform(payload: AttributionPayload): string | null {
  if (payload.gclid || payload.gbraid || payload.wbraid) return 'google_ads';
  if (payload.msclkid) return 'microsoft_ads';
  if (payload.fbclid) return 'meta';
  if (payload.ttclid) return 'tiktok';

  const utmSource = normalizeToken(payload.utm_source);
  const utmMedium = normalizeToken(payload.utm_medium);
  const referrerHost = normalizeToken(payload.referrer_host);

  if (isGoogleBusinessProfileSource(utmSource)) return 'google_business_profile';
  if (isEmailSource(utmSource) || utmMedium === 'email') return 'email';
  if (isSmsSource(utmSource) || utmMedium === 'sms') return 'sms';
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
  if (referrerHost.includes('facebook.com') || referrerHost.includes('instagram.com')) return 'meta';
  if (referrerHost.includes('reddit.com')) return 'reddit';
  if (referrerHost.includes('tiktok.com')) return 'tiktok';
  if (!referrerHost) return 'direct';
  return 'referral';
}

function inferAcquisitionClass(
  payload: AttributionPayload,
): AttributionPayload['acquisition_class'] {
  const sourcePlatform = normalizeToken(payload.source_platform || inferSourcePlatform(payload));
  const utmMedium = normalizeToken(payload.utm_medium);

  if (
    payload.gclid ||
    payload.gbraid ||
    payload.wbraid ||
    payload.msclkid ||
    payload.fbclid ||
    payload.ttclid ||
    hasPaidMedium(utmMedium)
  ) {
    return 'paid';
  }

  if (
    sourcePlatform === 'email' ||
    sourcePlatform === 'sms' ||
    sourcePlatform === 'google_business_profile' ||
    utmMedium === 'email' ||
    utmMedium === 'sms'
  ) {
    return 'owned';
  }

  if (
    sourcePlatform === 'organic_google' ||
    sourcePlatform === 'organic_bing' ||
    sourcePlatform === 'google' ||
    sourcePlatform === 'bing'
  ) {
    return 'organic';
  }

  if (sourcePlatform === 'direct') {
    return 'direct';
  }

  if (sourcePlatform) {
    return 'referral';
  }

  return null;
}

function extractTouch(touch: unknown): TouchRecord | null {
  if (!touch || typeof touch !== 'object') return null;
  const out: TouchRecord = {};
  for (const key of CLICK_KEYS) {
    const value = pickValue(touch, key);
    if (value) out[key] = value;
  }
  for (const key of UTM_KEYS) {
    const value = pickValue(touch, key);
    if (value) out[key] = value;
  }
  const ts = pickValue(touch, 'ts');
  if (ts) out.ts = ts;
  const landing = pickValue(touch, 'landing_page');
  if (landing) out.landing_page = landing;
  return Object.keys(out).length ? out : null;
}

function buildSourceFingerprint(payload: AttributionPayload | null): string {
  if (!payload) return 'direct';
  return [
    payload.source_platform,
    payload.acquisition_class,
    payload.utm_source,
    payload.utm_medium,
    payload.utm_campaign,
    payload.click_id_type,
    payload.gclid,
    payload.gbraid,
    payload.wbraid,
    payload.msclkid,
    payload.fbclid,
    payload.ttclid,
  ]
    .map((value) => (typeof value === 'string' ? value : ''))
    .join('|');
}

export function getAttributionPayloadFromBrowser(): AttributionPayload | null {
  if (typeof window === 'undefined') return null;
  const stored = readStorage() || {};
  const firstTouch = extractTouch(stored.first_touch);
  const lastTouch = extractTouch(stored.last_touch) || firstTouch;

  const payload: AttributionPayload = {
    gclid: pickValue(lastTouch, 'gclid') || pickValue(firstTouch, 'gclid') || readCookie('gclid'),
    gbraid:
      pickValue(lastTouch, 'gbraid') || pickValue(firstTouch, 'gbraid') || readCookie('gbraid'),
    wbraid:
      pickValue(lastTouch, 'wbraid') || pickValue(firstTouch, 'wbraid') || readCookie('wbraid'),
    msclkid: pickValue(lastTouch, 'msclkid') || pickValue(firstTouch, 'msclkid'),
    fbclid: pickValue(lastTouch, 'fbclid') || pickValue(firstTouch, 'fbclid'),
    ttclid: pickValue(lastTouch, 'ttclid') || pickValue(firstTouch, 'ttclid'),
    utm_source: pickValue(lastTouch, 'utm_source') || pickValue(firstTouch, 'utm_source'),
    utm_medium: pickValue(lastTouch, 'utm_medium') || pickValue(firstTouch, 'utm_medium'),
    utm_campaign: pickValue(lastTouch, 'utm_campaign') || pickValue(firstTouch, 'utm_campaign'),
    utm_term: pickValue(lastTouch, 'utm_term') || pickValue(firstTouch, 'utm_term'),
    utm_content: pickValue(lastTouch, 'utm_content') || pickValue(firstTouch, 'utm_content'),
    first_touch_ts: pickValue(firstTouch, 'ts'),
    last_touch_ts: pickValue(lastTouch, 'ts'),
    landing_page: pickValue(stored, 'landing_page') || window.location.pathname,
    referrer: pickValue(stored, 'referrer') || document.referrer || null,
    device_type: getDeviceType(),
    referrer_host: null,
    source_platform: null,
    acquisition_class: null,
    click_id_type: null,
  };

  payload.referrer_host = getReferrerHost(payload.referrer);
  payload.click_id_type = getClickIdType(payload);
  payload.source_platform = inferSourcePlatform(payload);
  payload.acquisition_class = inferAcquisitionClass(payload);

  const hasAny = Object.values(payload).some(
    (value) => typeof value === 'string' && value.trim(),
  );
  return hasAny ? payload : null;
}

export function attributionPayloadToDataLayer(
  payload: AttributionPayload | null,
): Record<string, string | null> {
  return {
    gclid: payload?.gclid ?? null,
    gbraid: payload?.gbraid ?? null,
    wbraid: payload?.wbraid ?? null,
    msclkid: payload?.msclkid ?? null,
    fbclid: payload?.fbclid ?? null,
    ttclid: payload?.ttclid ?? null,
    utm_source: payload?.utm_source ?? null,
    utm_medium: payload?.utm_medium ?? null,
    utm_campaign: payload?.utm_campaign ?? null,
    utm_term: payload?.utm_term ?? null,
    utm_content: payload?.utm_content ?? null,
    landing_page: payload?.landing_page ?? null,
    device_type: payload?.device_type ?? null,
    referrer_host: payload?.referrer_host ?? null,
    source_platform: payload?.source_platform ?? null,
    acquisition_class: payload?.acquisition_class ?? null,
    click_id_type: payload?.click_id_type ?? null,
  };
}

export function getStoredLeadUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage?.getItem(USER_STORAGE_KEY);
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function getLeadJourneyId(): string | null {
  if (typeof window === 'undefined') return null;
  const nowMs = Date.now();
  const attribution = getAttributionPayloadFromBrowser();
  const nextFingerprint = buildSourceFingerprint(attribution);
  const stored = readJourneyStorage();
  const stale =
    typeof stored?.updated_at_ms === 'number' ? nowMs - stored.updated_at_ms > JOURNEY_IDLE_TIMEOUT_MS : true;
  const sourceChanged =
    typeof stored?.source_fingerprint === 'string' &&
    stored.source_fingerprint.length > 0 &&
    stored.source_fingerprint !== nextFingerprint;

  const journeyId =
    !stale && !sourceChanged && typeof stored?.journey_id === 'string' && stored.journey_id.trim()
      ? stored.journey_id.trim()
      : createJourneyId();

  writeJourneyStorage({
    journey_id: journeyId,
    source_fingerprint: nextFingerprint,
    started_at_ms:
      !stale && !sourceChanged && typeof stored?.started_at_ms === 'number'
        ? stored.started_at_ms
        : nowMs,
    updated_at_ms: nowMs,
  });

  return journeyId;
}
