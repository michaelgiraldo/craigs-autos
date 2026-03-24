const STORAGE_KEY = 'craigs_attribution_v1';
const CLICK_KEYS = ['gclid', 'gbraid', 'wbraid', 'msclkid', 'fbclid', 'ttclid'];
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function readCookie(name) {
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

function pickValue(obj, key) {
  const value = obj && typeof obj === 'object' ? obj[key] : null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getDeviceType() {
  if (typeof window === 'undefined') return null;
  try {
    return window.matchMedia('(max-width: 900px)').matches ? 'mobile' : 'desktop';
  } catch {
    return null;
  }
}

function getReferrerHost(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

function normalizeToken(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function hasPaidMedium(value) {
  return ['cpc', 'ppc', 'paid', 'paid_search', 'paid-social', 'display'].includes(
    normalizeToken(value)
  );
}

function getClickIdType(payload) {
  if (payload.gclid) return 'gclid';
  if (payload.gbraid) return 'gbraid';
  if (payload.wbraid) return 'wbraid';
  if (payload.msclkid) return 'msclkid';
  if (payload.fbclid) return 'fbclid';
  if (payload.ttclid) return 'ttclid';
  return null;
}

function inferSourcePlatform(payload) {
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
  if (referrerHost.includes('facebook.com') || referrerHost.includes('instagram.com')) return 'meta';
  if (referrerHost.includes('reddit.com')) return 'reddit';
  if (referrerHost.includes('tiktok.com')) return 'tiktok';
  if (!referrerHost) return 'direct';
  return 'referral';
}

function extractTouch(touch) {
  if (!touch || typeof touch !== 'object') return null;
  const out = {};
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

export function getAttributionPayload() {
  if (typeof window === 'undefined') return null;
  const stored = readStorage() || {};
  const firstTouch = extractTouch(stored.first_touch);
  const lastTouch = extractTouch(stored.last_touch) || firstTouch;

  const payload = {
    gclid: pickValue(lastTouch, 'gclid') || pickValue(firstTouch, 'gclid') || readCookie('gclid'),
    gbraid: pickValue(lastTouch, 'gbraid') || pickValue(firstTouch, 'gbraid') || readCookie('gbraid'),
    wbraid: pickValue(lastTouch, 'wbraid') || pickValue(firstTouch, 'wbraid') || readCookie('wbraid'),
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
    landing_page: pickValue(stored, 'landing_page') || (typeof window !== 'undefined' ? window.location.pathname : null),
    referrer: pickValue(stored, 'referrer') || (typeof document !== 'undefined' ? document.referrer : null),
    device_type: getDeviceType(),
    referrer_host: null,
    source_platform: null,
    click_id_type: null,
  };

  payload.referrer_host = getReferrerHost(payload.referrer);
  payload.click_id_type = getClickIdType(payload);
  payload.source_platform = inferSourcePlatform(payload);

  const hasAny = Object.values(payload).some((value) => typeof value === 'string' && value.trim());
  return hasAny ? payload : null;
}

export function getAttributionForDataLayer() {
  const payload = getAttributionPayload();
  if (!payload) return null;
  return {
    gclid: payload.gclid ?? null,
    gbraid: payload.gbraid ?? null,
    wbraid: payload.wbraid ?? null,
    msclkid: payload.msclkid ?? null,
    fbclid: payload.fbclid ?? null,
    ttclid: payload.ttclid ?? null,
    utm_source: payload.utm_source ?? null,
    utm_medium: payload.utm_medium ?? null,
    utm_campaign: payload.utm_campaign ?? null,
    utm_term: payload.utm_term ?? null,
    utm_content: payload.utm_content ?? null,
    device_type: payload.device_type ?? null,
    referrer_host: payload.referrer_host ?? null,
    source_platform: payload.source_platform ?? null,
    click_id_type: payload.click_id_type ?? null,
  };
}
