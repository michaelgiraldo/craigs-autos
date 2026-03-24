import {
  type AttributionPayload,
  PAID_LANDING_SESSION_KEY,
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
  };

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
  'first_touch_ts' | 'last_touch_ts' | 'landing_page' | 'referrer' | 'device_type'
> => {
  try {
    const params = new URLSearchParams(window.location.search || '');
    return {
      gclid: params.get('gclid') || null,
      gbraid: params.get('gbraid') || null,
      wbraid: params.get('wbraid') || null,
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
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_term: null,
      utm_content: null,
    };
  }
};

export const hasPaidClickId = (params: ReturnType<typeof getUrlAttributionParams>) =>
  Boolean(params.gclid || params.gbraid || params.wbraid);

export const attributionForDataLayer = (attribution: AttributionPayload | null) => {
  const a = attribution || ({} as AttributionPayload);
  return {
    gclid: a.gclid || null,
    gbraid: a.gbraid || null,
    wbraid: a.wbraid || null,
    utm_source: a.utm_source || null,
    utm_medium: a.utm_medium || null,
    utm_campaign: a.utm_campaign || null,
    utm_term: a.utm_term || null,
    utm_content: a.utm_content || null,
    device_type: a.device_type || null,
  };
};

export const markPaidLandingSeen = (signature: string) => {
  try {
    if (!signature || !window.sessionStorage) return;
    window.sessionStorage.setItem(PAID_LANDING_SESSION_KEY, signature);
  } catch {
    // Ignore storage failures.
  }
};

export const wasPaidLandingSeen = (signature: string): boolean => {
  try {
    if (!signature || !window.sessionStorage) return false;
    return window.sessionStorage.getItem(PAID_LANDING_SESSION_KEY) === signature;
  } catch {
    return false;
  }
};
