import { PUBLIC_API_ROUTES } from '../../../shared/public-api-contract.js';
import { resolvePublicApiUrl } from '../../lib/backend/public-api-client';
import { withFetchTimeout } from './shared';

let endpointCache: string | null = null;
let endpointPromise: Promise<string | null> | null = null;

const resolveEndpoint = (): Promise<string | null> => {
  if (endpointCache) return Promise.resolve(endpointCache);
  if (endpointPromise) return endpointPromise;
  endpointPromise = resolvePublicApiUrl(PUBLIC_API_ROUTES.leadSignal)
    .then((url) => {
      if (typeof url === 'string' && url.trim()) {
        endpointCache = url.trim();
        return endpointCache;
      }
      endpointPromise = null;
      return null;
    })
    .catch(() => {
      endpointPromise = null;
      return null;
    });
  return endpointPromise;
};

export const resetSignalEndpointCache = () => {
  endpointCache = null;
  endpointPromise = null;
};

export const sendSignal = (payload: Record<string, unknown>) => {
  void resolveEndpoint().then((endpoint) => {
    if (!endpoint) return;
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      try {
        const sent = navigator.sendBeacon(endpoint, body);
        if (sent) return;
      } catch {
        // fall through
      }
    }
    void fetch(
      endpoint,
      withFetchTimeout({
        method: 'POST',
        mode: 'no-cors',
        keepalive: true,
        body,
      }),
    ).catch(() => {});
  });
};
