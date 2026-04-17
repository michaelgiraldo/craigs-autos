export {
  CLICK_KEYS,
  JOURNEY_STORAGE_KEY,
  STORAGE_KEY,
  USER_STORAGE_KEY,
  UTM_KEYS,
} from './attribution-core/constants';
export { getLeadJourneyId } from './attribution-core/journey';
export {
  attributionPayloadToDataLayer,
  getAttributionPayloadFromBrowser,
} from './attribution-core/payload';
export { getStoredLeadUserId, safeJsonParse } from './attribution-core/storage';
export type {
  AttributionPayload,
  ClickKey,
  StoredAttributionState,
  StoredJourneyState,
  TouchRecord,
  UtmKey,
} from './attribution-core/types';
