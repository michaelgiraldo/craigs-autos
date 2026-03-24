import {
  attributionForDataLayer,
  getAttribution,
  getUrlAttributionParams,
  getUserId,
  hasPaidClickId,
  markPaidLandingSeen,
  wasPaidLandingSeen,
} from './attribution';
import type { AttributionPayload } from './shared';
import { pushDataLayer, sendSignal } from './transport';

export const trackPaidLanding = () => {
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

export const trackLeadClick = (event: MouseEvent) => {
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
