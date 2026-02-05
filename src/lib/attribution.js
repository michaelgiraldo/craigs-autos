const STORAGE_KEY = 'craigs_attribution_v1';
const CLICK_KEYS = ['gclid', 'gbraid', 'wbraid'];
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
    utm_source: pickValue(lastTouch, 'utm_source') || pickValue(firstTouch, 'utm_source'),
    utm_medium: pickValue(lastTouch, 'utm_medium') || pickValue(firstTouch, 'utm_medium'),
    utm_campaign: pickValue(lastTouch, 'utm_campaign') || pickValue(firstTouch, 'utm_campaign'),
    utm_term: pickValue(lastTouch, 'utm_term') || pickValue(firstTouch, 'utm_term'),
    utm_content: pickValue(lastTouch, 'utm_content') || pickValue(firstTouch, 'utm_content'),
    first_touch_ts: pickValue(firstTouch, 'ts'),
    last_touch_ts: pickValue(lastTouch, 'ts'),
    landing_page: pickValue(stored, 'landing_page') || (typeof window !== 'undefined' ? window.location.pathname : null),
    referrer: pickValue(stored, 'referrer') || (typeof document !== 'undefined' ? document.referrer : null),
  };

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
    utm_source: payload.utm_source ?? null,
    utm_medium: payload.utm_medium ?? null,
    utm_campaign: payload.utm_campaign ?? null,
    utm_term: payload.utm_term ?? null,
    utm_content: payload.utm_content ?? null,
  };
}
