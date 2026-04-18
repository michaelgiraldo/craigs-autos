import { getAttributionForDataLayer } from '../../lib/attribution.js';
import { pushLeadDataLayerEvent } from '../../features/lead-tracking/browser-events.ts';

export function pushLeadDataLayer(eventName, params = {}) {
  const attribution = getAttributionForDataLayer();
  pushLeadDataLayerEvent(eventName, params, attribution);
}
