import {
  attributionPayloadToDataLayer,
  getAttributionPayloadFromBrowser,
  getLeadJourneyId as getStoredLeadJourneyId,
  getStoredLeadUserId,
} from './attribution-core.ts';

export function getAttributionPayload() {
  return getAttributionPayloadFromBrowser();
}

export function getAttributionForDataLayer() {
  const payload = getAttributionPayload();
  return payload ? attributionPayloadToDataLayer(payload) : null;
}

export function getLeadUserId() {
  return getStoredLeadUserId();
}

export function getJourneyId() {
  return getStoredLeadJourneyId();
}
