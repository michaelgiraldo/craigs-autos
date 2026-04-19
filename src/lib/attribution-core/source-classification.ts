import { normalizeToken } from './browser-values';
import type { AttributionPayload } from './types';

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

export function getClickIdType(payload: AttributionPayload): string | null {
  if (payload.gclid) return 'gclid';
  if (payload.gbraid) return 'gbraid';
  if (payload.wbraid) return 'wbraid';
  if (payload.msclkid) return 'msclkid';
  if (payload.fbclid) return 'fbclid';
  if (payload.ttclid) return 'ttclid';
  if (payload.li_fat_id) return 'li_fat_id';
  if (payload.epik) return 'epik';
  if (payload.sc_click_id) return 'sc_click_id';
  if (payload.yelp_lead_id) return 'yelp_lead_id';
  return null;
}

export function inferSourcePlatform(payload: AttributionPayload): string | null {
  if (payload.gclid || payload.gbraid || payload.wbraid) return 'google_ads';
  if (payload.msclkid) return 'microsoft_ads';
  if (payload.fbclid) return 'meta_ads';
  if (payload.ttclid) return 'tiktok_ads';
  if (payload.li_fat_id) return 'linkedin_ads';
  if (payload.epik) return 'pinterest_ads';
  if (payload.sc_click_id) return 'snap_ads';
  if (payload.yelp_lead_id) return 'yelp_ads';
  if (payload.fbc || payload.fbp) return 'meta_ads';
  if (payload.ttp) return 'tiktok_ads';
  if (payload.scid) return 'snap_ads';

  const utmSource = normalizeToken(payload.utm_source);
  const utmMedium = normalizeToken(payload.utm_medium);
  const referrerHost = normalizeToken(payload.referrer_host);

  if (isGoogleBusinessProfileSource(utmSource)) return 'google_business_profile';
  if (isEmailSource(utmSource) || utmMedium === 'email') return 'email';
  if (isSmsSource(utmSource) || utmMedium === 'sms') return 'sms';
  if (utmSource === 'yelp') return hasPaidMedium(utmMedium) ? 'yelp_ads' : 'yelp';
  if (utmSource === 'reddit') return 'reddit';
  if (utmSource === 'tiktok') return hasPaidMedium(utmMedium) ? 'tiktok_ads' : 'tiktok';
  if (utmSource === 'linkedin')
    return hasPaidMedium(utmMedium) ? 'linkedin_ads' : 'linkedin';
  if (utmSource === 'pinterest')
    return hasPaidMedium(utmMedium) ? 'pinterest_ads' : 'pinterest';
  if (utmSource === 'snap' || utmSource === 'snapchat')
    return hasPaidMedium(utmMedium) ? 'snap_ads' : 'snapchat';
  if (utmSource === 'facebook' || utmSource === 'instagram' || utmSource === 'meta') {
    return hasPaidMedium(utmMedium) ? 'meta_ads' : 'meta';
  }
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

export function inferAcquisitionClass(
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
    payload.li_fat_id ||
    payload.epik ||
    payload.sc_click_id ||
    payload.yelp_lead_id ||
    payload.fbc ||
    payload.fbp ||
    payload.ttp ||
    payload.scid ||
    sourcePlatform.endsWith('_ads') ||
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

export function buildSourceFingerprint(payload: AttributionPayload | null): string {
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
    payload.li_fat_id,
    payload.epik,
    payload.sc_click_id,
    payload.yelp_lead_id,
    payload.fbp,
    payload.fbc,
    payload.ttp,
    payload.scid,
  ]
    .map((value) => (typeof value === 'string' ? value : ''))
    .join('|');
}
