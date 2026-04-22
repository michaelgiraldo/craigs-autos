import {
  attributionPayloadToDataLayer,
  getAttributionPayloadFromBrowser,
} from './attribution-core/payload.ts';
import {
  getLeadJourneyId as getStoredLeadJourneyId,
} from './attribution-core/journey.ts';
import {
  getStoredLeadUserId,
} from './attribution-core/storage.ts';

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
