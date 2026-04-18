import { OUTPUTS_PATH, withFetchTimeout } from './shared';

let endpointCache: string | null = null;
let endpointPromise: Promise<string | null> | null = null;

const resolveEndpoint = (): Promise<string | null> => {
  if (endpointCache) return Promise.resolve(endpointCache);
  if (endpointPromise) return endpointPromise;
  endpointPromise = fetch(OUTPUTS_PATH, withFetchTimeout({ cache: 'no-store' }))
    .then((res) => {
      if (!res.ok) return null;
      return res.json() as Promise<{ custom?: { chatkit_lead_signal_url?: string } }>;
    })
    .then((data) => {
      const url = data?.custom?.chatkit_lead_signal_url;
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
