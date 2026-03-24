export const OUTPUTS_PATH = '/amplify_outputs.json';
export const FETCH_TIMEOUT_MS = 8_000;
export const STORAGE_KEY = 'craigs_attribution_v1';
export const USER_KEY = 'chatkit-user-id';
export const PAID_LANDING_SESSION_KEY = 'craigs_paid_landing_seen_v1';

export type AttributionPayload = {
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  first_touch_ts?: string | null;
  last_touch_ts?: string | null;
  landing_page?: string | null;
  referrer?: string | null;
  device_type?: string | null;
};

export type TouchRecord = Record<string, string | null | undefined>;

export type StoredAttributionState = {
  first_touch?: TouchRecord | null;
  last_touch?: TouchRecord | null;
  landing_page?: string | null;
  referrer?: string | null;
};

export const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const withFetchTimeout = (options: RequestInit = {}) => {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
  }
  return options;
};
