import { getDeviceType, getReferrerHost, pickValue } from './browser-values';
import {
  getClickIdType,
  inferAcquisitionClass,
  inferSourcePlatform,
} from './source-classification';
import { readAttributionStorage, readCookie } from './storage';
import { extractTouch } from './touch';
import type { AttributionPayload } from './types';

export function getAttributionPayloadFromBrowser(): AttributionPayload | null {
  if (typeof window === 'undefined') return null;
  const stored = readAttributionStorage() || {};
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

  const hasAny = Object.values(payload).some((value) => typeof value === 'string' && value.trim());
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
