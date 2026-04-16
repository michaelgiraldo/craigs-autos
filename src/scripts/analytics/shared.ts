export const OUTPUTS_PATH = '/amplify_outputs.json';
export const FETCH_TIMEOUT_MS = 8_000;

export const withFetchTimeout = (options: RequestInit = {}) => {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
  }
  return options;
};
