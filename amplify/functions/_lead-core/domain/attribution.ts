import { asObject } from '../../_shared/safe.ts';
import { trimToNull } from './normalize.ts';

export type DeviceType = 'mobile' | 'desktop';

export type AcquisitionClass = 'paid' | 'organic' | 'owned' | 'referral' | 'direct';

export type AttributionSnapshot = {
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
  device_type: DeviceType | null;
  source_platform: string | null;
  acquisition_class: AcquisitionClass | null;
  click_id_type: string | null;
};

type UrlAttributionKey =
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
  | 'utm_content';

function normalizeDeviceType(value: unknown): AttributionSnapshot['device_type'] {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'mobile' || normalized === 'desktop') return normalized;
  return null;
}

function normalizeAcquisitionClass(value: unknown): AttributionSnapshot['acquisition_class'] {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'paid' ||
    normalized === 'organic' ||
    normalized === 'owned' ||
    normalized === 'referral' ||
    normalized === 'direct'
  ) {
    return normalized;
  }
  return null;
}

function normalizeToken(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
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
  return (
    value === 'google_business_profile' || value === 'google-business-profile' || value === 'gbp'
  );
}

export function extractHostname(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

export function getClickIdType(attribution: AttributionSnapshot): string | null {
  if (attribution.gclid) return 'gclid';
  if (attribution.gbraid) return 'gbraid';
  if (attribution.wbraid) return 'wbraid';
  if (attribution.msclkid) return 'msclkid';
  if (attribution.fbclid) return 'fbclid';
  if (attribution.ttclid) return 'ttclid';
  return null;
}

export function inferSourcePlatform(attribution: AttributionSnapshot): string | null {
  if (attribution.gclid || attribution.gbraid || attribution.wbraid) return 'google_ads';
  if (attribution.msclkid) return 'microsoft_ads';
  if (attribution.fbclid) return 'meta';
  if (attribution.ttclid) return 'tiktok';

  const utmSource = normalizeToken(attribution.utm_source);
  const utmMedium = normalizeToken(attribution.utm_medium);
  const referrerHost = normalizeToken(attribution.referrer_host);

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
  if (referrerHost.includes('facebook.com') || referrerHost.includes('instagram.com'))
    return 'meta';
  if (referrerHost.includes('reddit.com')) return 'reddit';
  if (referrerHost.includes('tiktok.com')) return 'tiktok';
  if (!referrerHost) return 'direct';
  return 'referral';
}

export function inferAcquisitionClass(attribution: AttributionSnapshot): AcquisitionClass | null {
  const sourcePlatform = normalizeToken(
    attribution.source_platform || inferSourcePlatform(attribution),
  );
  const utmMedium = normalizeToken(attribution.utm_medium);

  if (
    attribution.gclid ||
    attribution.gbraid ||
    attribution.wbraid ||
    attribution.msclkid ||
    attribution.fbclid ||
    attribution.ttclid ||
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

export function sanitizeAttributionSnapshot(input: unknown): AttributionSnapshot | null {
  const data = asObject(input);
  if (!data) return null;

  const payload: AttributionSnapshot = {
    gclid: trimToNull(data.gclid, 128),
    gbraid: trimToNull(data.gbraid, 128),
    wbraid: trimToNull(data.wbraid, 128),
    msclkid: trimToNull(data.msclkid, 128),
    fbclid: trimToNull(data.fbclid, 128),
    ttclid: trimToNull(data.ttclid, 128),
    utm_source: trimToNull(data.utm_source, 128),
    utm_medium: trimToNull(data.utm_medium, 128),
    utm_campaign: trimToNull(data.utm_campaign, 200),
    utm_term: trimToNull(data.utm_term, 200),
    utm_content: trimToNull(data.utm_content, 200),
    first_touch_ts: trimToNull(data.first_touch_ts, 64),
    last_touch_ts: trimToNull(data.last_touch_ts, 64),
    landing_page: trimToNull(data.landing_page, 300),
    referrer: trimToNull(data.referrer, 300),
    referrer_host: trimToNull(data.referrer_host, 200),
    device_type: normalizeDeviceType(data.device_type),
    source_platform: trimToNull(data.source_platform, 80),
    acquisition_class: normalizeAcquisitionClass(data.acquisition_class),
    click_id_type: trimToNull(data.click_id_type, 40),
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
  if (!payload.acquisition_class) {
    payload.acquisition_class = inferAcquisitionClass(payload);
  }

  const hasAny = Object.values(payload).some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
  return hasAny ? payload : null;
}

function attributionFromUrl(
  urlValue: unknown,
): Partial<Record<UrlAttributionKey, string | null>> | null {
  const raw = trimToNull(urlValue, 2_000);
  if (!raw) return null;

  try {
    const url = new URL(raw, 'https://craigs.autos');
    const payload: Partial<Record<UrlAttributionKey, string | null>> = {
      gclid: trimToNull(url.searchParams.get('gclid'), 128),
      gbraid: trimToNull(url.searchParams.get('gbraid'), 128),
      wbraid: trimToNull(url.searchParams.get('wbraid'), 128),
      msclkid: trimToNull(url.searchParams.get('msclkid'), 128),
      fbclid: trimToNull(url.searchParams.get('fbclid'), 128),
      ttclid: trimToNull(url.searchParams.get('ttclid'), 128),
      utm_source: trimToNull(url.searchParams.get('utm_source'), 128),
      utm_medium: trimToNull(url.searchParams.get('utm_medium'), 128),
      utm_campaign: trimToNull(url.searchParams.get('utm_campaign'), 200),
      utm_term: trimToNull(url.searchParams.get('utm_term'), 200),
      utm_content: trimToNull(url.searchParams.get('utm_content'), 200),
    };

    const hasAny = Object.values(payload).some(
      (value) => typeof value === 'string' && value.trim().length > 0,
    );
    return hasAny ? payload : null;
  } catch {
    return null;
  }
}

export function mergeAttributionSnapshot(
  inputAttribution: unknown,
  pageUrl: unknown,
  clickUrl: unknown,
): AttributionSnapshot | null {
  const base = sanitizeAttributionSnapshot(inputAttribution);
  const fromPage = attributionFromUrl(pageUrl);
  const fromClick = attributionFromUrl(clickUrl);

  const merged: AttributionSnapshot = {
    gclid: base?.gclid ?? fromPage?.gclid ?? fromClick?.gclid ?? null,
    gbraid: base?.gbraid ?? fromPage?.gbraid ?? fromClick?.gbraid ?? null,
    wbraid: base?.wbraid ?? fromPage?.wbraid ?? fromClick?.wbraid ?? null,
    msclkid: base?.msclkid ?? fromPage?.msclkid ?? fromClick?.msclkid ?? null,
    fbclid: base?.fbclid ?? fromPage?.fbclid ?? fromClick?.fbclid ?? null,
    ttclid: base?.ttclid ?? fromPage?.ttclid ?? fromClick?.ttclid ?? null,
    utm_source: base?.utm_source ?? fromPage?.utm_source ?? fromClick?.utm_source ?? null,
    utm_medium: base?.utm_medium ?? fromPage?.utm_medium ?? fromClick?.utm_medium ?? null,
    utm_campaign: base?.utm_campaign ?? fromPage?.utm_campaign ?? fromClick?.utm_campaign ?? null,
    utm_term: base?.utm_term ?? fromPage?.utm_term ?? fromClick?.utm_term ?? null,
    utm_content: base?.utm_content ?? fromPage?.utm_content ?? fromClick?.utm_content ?? null,
    first_touch_ts: base?.first_touch_ts ?? null,
    last_touch_ts: base?.last_touch_ts ?? null,
    landing_page: base?.landing_page ?? null,
    referrer: base?.referrer ?? null,
    referrer_host: base?.referrer_host ?? extractHostname(base?.referrer ?? null),
    device_type: base?.device_type ?? null,
    source_platform: base?.source_platform ?? null,
    acquisition_class: base?.acquisition_class ?? null,
    click_id_type: base?.click_id_type ?? null,
  };

  merged.click_id_type = getClickIdType(merged);
  merged.source_platform = inferSourcePlatform(merged);
  merged.acquisition_class = inferAcquisitionClass(merged);

  const hasAny = Object.values(merged).some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
  return hasAny ? merged : null;
}
