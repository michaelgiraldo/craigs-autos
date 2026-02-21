import { getAttributionForDataLayer } from '../../lib/attribution.js';

export function pushDataLayer(eventName, params = {}) {
  try {
    globalThis.dataLayer = globalThis.dataLayer || [];
    globalThis.dataLayer.push({ event: eventName, ...params });
  } catch {
    // Ignore analytics failures.
  }
}

export function pushLeadDataLayer(eventName, params = {}) {
  const attribution = getAttributionForDataLayer();
  pushDataLayer(eventName, {
    ...(attribution ?? {}),
    ...params,
  });
}
