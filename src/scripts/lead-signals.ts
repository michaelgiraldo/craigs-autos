const OUTPUTS_PATH = '/amplify_outputs.json';
const FETCH_TIMEOUT_MS = 8_000;
const STORAGE_KEY = 'craigs_attribution_v1';
const USER_KEY = 'chatkit-user-id';
const PAID_LANDING_SESSION_KEY = 'craigs_paid_landing_seen_v1';

let endpointCache: string | null = null;
let endpointPromise: Promise<string | null> | null = null;

type AttributionPayload = {
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  first_touch_ts?: string | null;
  last_touch_ts?: string | null;
  landing_page?: string | null;
  referrer?: string | null;
  device_type?: string | null;
};

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const withFetchTimeout = (options: RequestInit = {}) => {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
  }
  return options;
};

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

const getAttribution = (): AttributionPayload | null => {
  const stored = (readStorage() || {}) as Record<string, any>;
  const first = (stored.first_touch || {}) as Record<string, string | null>;
  const last = (stored.last_touch || first) as Record<string, string | null>;
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
    landing_page: stored.landing_page || window.location.pathname,
    referrer: stored.referrer || document.referrer || null,
    device_type: deviceType,
  };

  const hasAny = Object.values(payload).some((value) => Boolean(value));
  return hasAny ? payload : null;
};

const getUserId = (): string | null => {
  try {
    return window.localStorage ? window.localStorage.getItem(USER_KEY) : null;
  } catch {
    return null;
  }
};

const resolveEndpoint = (): Promise<string | null> => {
  if (endpointCache) return Promise.resolve(endpointCache);
  if (endpointPromise) return endpointPromise;
  endpointPromise = fetch(OUTPUTS_PATH, withFetchTimeout({ cache: 'no-store' }))
    .then((res) => {
      if (!res.ok) return null;
      return res.json() as Promise<{ custom?: { chatkit_lead_signal_url?: string } }>;
    })
    .then((data) => {
      const url = data?.custom?.chatkit_lead_signal_url;
      if (typeof url === 'string' && url.trim()) {
        endpointCache = url.trim();
        return endpointCache;
      }
      return null;
    })
    .catch(() => null);
  return endpointPromise;
};

const sendSignal = (payload: Record<string, unknown>) => {
  void resolveEndpoint().then((endpoint) => {
    if (!endpoint) return;
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      try {
        const sent = navigator.sendBeacon(endpoint, body);
        if (sent) return;
      } catch {
        // fall through
      }
    }
    void fetch(
      endpoint,
      withFetchTimeout({
        method: 'POST',
        mode: 'no-cors',
        keepalive: true,
        body,
      }),
    ).catch(() => {});
  });
};

const pushDataLayer = (eventName: string, params: Record<string, unknown>) => {
  try {
    const dataLayerWindow = window as Window & { dataLayer?: Record<string, unknown>[] };
    dataLayerWindow.dataLayer = dataLayerWindow.dataLayer || [];
    dataLayerWindow.dataLayer.push({ event: eventName, ...params });
  } catch {
    // Ignore analytics failures.
  }
};

const getUrlAttributionParams = (): Omit<
  AttributionPayload,
  'first_touch_ts' | 'last_touch_ts' | 'landing_page' | 'referrer' | 'device_type'
> => {
  try {
    const p = new URLSearchParams(window.location.search || '');
    return {
      gclid: p.get('gclid') || null,
      gbraid: p.get('gbraid') || null,
      wbraid: p.get('wbraid') || null,
      utm_source: p.get('utm_source') || null,
      utm_medium: p.get('utm_medium') || null,
      utm_campaign: p.get('utm_campaign') || null,
      utm_term: p.get('utm_term') || null,
      utm_content: p.get('utm_content') || null,
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

const hasPaidClickId = (params: ReturnType<typeof getUrlAttributionParams>) =>
  Boolean(params.gclid || params.gbraid || params.wbraid);

const attributionForDataLayer = (attribution: AttributionPayload | null) => {
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

const markPaidLandingSeen = (signature: string) => {
  try {
    if (!signature || !window.sessionStorage) return;
    window.sessionStorage.setItem(PAID_LANDING_SESSION_KEY, signature);
  } catch {
    // Ignore storage failures.
  }
};

const wasPaidLandingSeen = (signature: string): boolean => {
  try {
    if (!signature || !window.sessionStorage) return false;
    return window.sessionStorage.getItem(PAID_LANDING_SESSION_KEY) === signature;
  } catch {
    return false;
  }
};

const handlePaidLanding = () => {
  const params = getUrlAttributionParams();
  if (!hasPaidClickId(params)) return;

  const attribution = getAttribution() || ({} as AttributionPayload);
  if (params.gclid) attribution.gclid = params.gclid;
  if (params.gbraid) attribution.gbraid = params.gbraid;
  if (params.wbraid) attribution.wbraid = params.wbraid;
  if (params.utm_source) attribution.utm_source = params.utm_source;
  if (params.utm_medium) attribution.utm_medium = params.utm_medium;
  if (params.utm_campaign) attribution.utm_campaign = params.utm_campaign;
  if (params.utm_term) attribution.utm_term = params.utm_term;
  if (params.utm_content) attribution.utm_content = params.utm_content;

  const signature = [
    params.gclid || '',
    params.gbraid || '',
    params.wbraid || '',
    window.location.pathname,
  ].join('|');
  if (wasPaidLandingSeen(signature)) return;

  const locale = document.documentElement ? document.documentElement.lang : null;
  const payload = {
    event: 'lead_ad_landing',
    pageUrl: window.location.href,
    user: getUserId(),
    locale,
    clickUrl: window.location.href,
    provider: 'google_ads',
    attribution,
  };

  pushDataLayer('lead_ad_landing', {
    lead_method: 'lead_ad_landing',
    page_url: window.location.href,
    click_url: window.location.href,
    provider: 'google_ads',
    locale,
    ...attributionForDataLayer(attribution),
  });

  sendSignal(payload);
  markPaidLandingSeen(signature);
};

const handleClick = (event: MouseEvent) => {
  let element: Element | null = event.target instanceof Element ? event.target : null;
  if (!element) return;
  if (element.closest) {
    element = element.closest('a');
  }
  if (!(element instanceof HTMLAnchorElement)) return;

  const href = element.getAttribute('href') || '';
  if (!href) return;

  let eventName: string | null = null;
  let provider: string | null = null;
  if (href.startsWith('tel:')) {
    eventName = 'lead_click_to_call';
  } else if (href.startsWith('sms:')) {
    eventName = 'lead_click_to_text';
  } else if (href.startsWith('mailto:')) {
    eventName = 'lead_click_email';
  } else if (href.startsWith('https://www.google.com/maps/dir/')) {
    eventName = 'lead_click_directions';
    provider = 'google_maps';
  } else if (href.startsWith('https://maps.apple.com/')) {
    eventName = 'lead_click_directions';
    provider = 'apple_maps';
  }

  if (!eventName) return;

  const attribution = getAttribution();
  const locale = document.documentElement ? document.documentElement.lang : null;
  const payload = {
    event: eventName,
    pageUrl: window.location.href,
    user: getUserId(),
    locale,
    clickUrl: href,
    provider,
    attribution,
  };

  pushDataLayer(eventName, {
    lead_method: eventName,
    page_url: window.location.href,
    click_url: href,
    provider,
    locale,
    ...attributionForDataLayer(attribution),
  });

  sendSignal(payload);
};

handlePaidLanding();
document.addEventListener('click', handleClick, { capture: true });
