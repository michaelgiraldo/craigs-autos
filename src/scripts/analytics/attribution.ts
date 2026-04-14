import {
  attributionPayloadToDataLayer,
  getAttributionPayloadFromBrowser,
  getLeadJourneyId,
  getStoredLeadUserId,
  type AttributionPayload,
} from '../../lib/attribution-core';

export const getAttribution = (): AttributionPayload | null => getAttributionPayloadFromBrowser();

export const getUserId = (): string | null => getStoredLeadUserId();
export const getJourneyId = (): string | null => getLeadJourneyId();

export const getUrlAttributionParams = (): Omit<
  AttributionPayload,
  | 'first_touch_ts'
  | 'last_touch_ts'
  | 'landing_page'
  | 'referrer'
  | 'referrer_host'
  | 'device_type'
  | 'source_platform'
  | 'acquisition_class'
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
  return attributionPayloadToDataLayer(attribution);
};
