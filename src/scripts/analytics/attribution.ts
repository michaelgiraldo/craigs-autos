import {
  type AttributionPayload,
  STORAGE_KEY,
  type StoredAttributionState,
  safeJsonParse,
  type TouchRecord,
  USER_KEY,
} from './shared';

const readStorage = () => {
  try {
    const raw = window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return null;
    const parsed = safeJsonParse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const readCookie = (name: string): string | null => {
  const cookies = document.cookie ? document.cookie.split(';') : [];
  for (const cookie of cookies) {
    const parts = cookie.split('=');
    const key = parts[0] ? parts[0].trim() : '';
    if (key === name) {
      return decodeURIComponent(parts.slice(1).join('=') || '').trim() || null;
    }
  }
  return null;
};

export const getAttribution = (): AttributionPayload | null => {
  const stored = (readStorage() || {}) as StoredAttributionState;
  const first = (stored.first_touch || {}) as TouchRecord;
  const last = (stored.last_touch || first) as TouchRecord;
  let deviceType: 'mobile' | 'desktop' | null = null;
  try {
    deviceType = window.matchMedia('(max-width: 900px)').matches ? 'mobile' : 'desktop';
  } catch {
    deviceType = null;
  }

  const payload: AttributionPayload = {
    gclid: last.gclid || first.gclid || readCookie('gclid'),
    gbraid: last.gbraid || first.gbraid || readCookie('gbraid'),
    wbraid: last.wbraid || first.wbraid || readCookie('wbraid'),
    msclkid: last.msclkid || first.msclkid || null,
    fbclid: last.fbclid || first.fbclid || null,
    ttclid: last.ttclid || first.ttclid || null,
    utm_source: last.utm_source || first.utm_source || null,
    utm_medium: last.utm_medium || first.utm_medium || null,
    utm_campaign: last.utm_campaign || first.utm_campaign || null,
    utm_term: last.utm_term || first.utm_term || null,
    utm_content: last.utm_content || first.utm_content || null,
    first_touch_ts: first.ts || null,
    last_touch_ts: last.ts || null,
    landing_page:
      (typeof stored.landing_page === 'string' && stored.landing_page) || window.location.pathname,
    referrer: (typeof stored.referrer === 'string' && stored.referrer) || document.referrer || null,
    device_type: deviceType,
    referrer_host: null,
    source_platform: null,
    click_id_type: null,
  };

  payload.referrer_host = extractHostname(payload.referrer);
  payload.click_id_type = getClickIdType(payload);
  payload.source_platform = inferSourcePlatform(payload);

  const hasAny = Object.values(payload).some((value) => Boolean(value));
  return hasAny ? payload : null;
};

export const getUserId = (): string | null => {
  try {
    return window.localStorage ? window.localStorage.getItem(USER_KEY) : null;
  } catch {
    return null;
  }
};

export const getUrlAttributionParams = (): Omit<
  AttributionPayload,
  | 'first_touch_ts'
  | 'last_touch_ts'
  | 'landing_page'
  | 'referrer'
  | 'referrer_host'
  | 'device_type'
  | 'source_platform'
  | 'click_id_type'
> => {
  try {
    const params = new URLSearchParams(window.location.search || '');
    return {
      gclid: params.get('gclid') || null,
      gbraid: params.get('gbraid') || null,
      wbraid: params.get('wbraid') || null,
      msclkid: params.get('msclkid') || null,
      fbclid: params.get('fbclid') || null,
      ttclid: params.get('ttclid') || null,
      utm_source: params.get('utm_source') || null,
      utm_medium: params.get('utm_medium') || null,
      utm_campaign: params.get('utm_campaign') || null,
      utm_term: params.get('utm_term') || null,
      utm_content: params.get('utm_content') || null,
    };
  } catch {
    return {
      gclid: null,
      gbraid: null,
      wbraid: null,
      msclkid: null,
      fbclid: null,
      ttclid: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_term: null,
      utm_content: null,
    };
  }
};

export const attributionForDataLayer = (attribution: AttributionPayload | null) => {
  const a = attribution || ({} as AttributionPayload);
  return {
    gclid: a.gclid || null,
    gbraid: a.gbraid || null,
    wbraid: a.wbraid || null,
    msclkid: a.msclkid || null,
    fbclid: a.fbclid || null,
    ttclid: a.ttclid || null,
    utm_source: a.utm_source || null,
    utm_medium: a.utm_medium || null,
    utm_campaign: a.utm_campaign || null,
    utm_term: a.utm_term || null,
    utm_content: a.utm_content || null,
    device_type: a.device_type || null,
    referrer_host: a.referrer_host || null,
    source_platform: a.source_platform || null,
    click_id_type: a.click_id_type || null,
  };
};

const extractHostname = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
};

const normalizeToken = (value: string | null | undefined) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const hasPaidMedium = (value: string | null | undefined) => {
  const normalized = normalizeToken(value);
  return ['cpc', 'ppc', 'paid', 'paid_search', 'paid-social', 'display'].includes(normalized);
};

const getClickIdType = (payload: AttributionPayload) => {
  if (payload.gclid) return 'gclid';
  if (payload.gbraid) return 'gbraid';
  if (payload.wbraid) return 'wbraid';
  if (payload.msclkid) return 'msclkid';
  if (payload.fbclid) return 'fbclid';
  if (payload.ttclid) return 'ttclid';
  return null;
};

const inferSourcePlatform = (payload: AttributionPayload) => {
  if (payload.gclid || payload.gbraid || payload.wbraid) return 'google_ads';
  if (payload.msclkid) return 'microsoft_ads';
  if (payload.fbclid) return 'meta';
  if (payload.ttclid) return 'tiktok';

  const utmSource = normalizeToken(payload.utm_source);
  const utmMedium = normalizeToken(payload.utm_medium);
  const referrerHost = normalizeToken(payload.referrer_host);

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
};
