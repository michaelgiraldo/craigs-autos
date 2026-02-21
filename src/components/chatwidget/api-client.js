import { AMPLIFY_OUTPUTS_PATH } from './constants.js';

const NETWORK_FETCH_TIMEOUT_MS = 8_000;

function withFetchTimeout(init = {}) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { ...init, signal: AbortSignal.timeout(NETWORK_FETCH_TIMEOUT_MS) };
  }
  return init;
}

export function isPlaceholderUrl(value) {
  return typeof value === 'string' && value.includes('<your-backend>');
}

export function shouldLoadAmplifyOutputs({ sessionUrl, leadEmailUrl }) {
  return (
    typeof sessionUrl !== 'string' ||
    isPlaceholderUrl(sessionUrl) ||
    sessionUrl.startsWith('/') ||
    typeof leadEmailUrl !== 'string' ||
    isPlaceholderUrl(leadEmailUrl) ||
    leadEmailUrl.startsWith('/')
  );
}

export async function fetchAmplifyOutputsUrls() {
  try {
    const response = await fetch(AMPLIFY_OUTPUTS_PATH, withFetchTimeout({ cache: 'no-store' }));
    if (!response.ok) return null;
    const data = await response.json();

    const sessionCandidate = data?.custom?.chatkit_session_url;
    const leadCandidate = data?.custom?.chatkit_lead_email_url;

    return {
      sessionUrl:
        typeof sessionCandidate === 'string' && sessionCandidate.trim()
          ? sessionCandidate.trim()
          : null,
      leadEmailUrl:
        typeof leadCandidate === 'string' && leadCandidate.trim() ? leadCandidate.trim() : null,
    };
  } catch {
    return null;
  }
}

export async function resolveSessionEndpoint({
  isDev,
  endpoint,
  onSessionUrl,
  onLeadEmailUrl,
}) {
  let resolvedEndpoint = endpoint;

  if (
    !isDev &&
    (typeof resolvedEndpoint !== 'string' ||
      isPlaceholderUrl(resolvedEndpoint) ||
      resolvedEndpoint.startsWith('/'))
  ) {
    const outputs = await fetchAmplifyOutputsUrls();
    if (outputs?.sessionUrl) {
      resolvedEndpoint = outputs.sessionUrl;
      onSessionUrl?.(outputs.sessionUrl);
    }
    if (outputs?.leadEmailUrl) {
      onLeadEmailUrl?.(outputs.leadEmailUrl);
    }
  }

  return resolvedEndpoint;
}

export async function resolveLeadEmailEndpoint({ isDev, endpoint, onLeadEmailUrl }) {
  let resolvedEndpoint = endpoint;
  if (!isDev && typeof resolvedEndpoint === 'string' && resolvedEndpoint.startsWith('/')) {
    const outputs = await fetchAmplifyOutputsUrls();
    if (outputs?.leadEmailUrl) {
      resolvedEndpoint = outputs.leadEmailUrl;
      onLeadEmailUrl?.(outputs.leadEmailUrl);
    }
  }
  return resolvedEndpoint;
}

export async function requestClientSecret({ endpoint, current, locale, userId, pageUrl }) {
  const response = await fetch(endpoint, withFetchTimeout({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      current,
      locale,
      user: userId ?? 'anonymous',
      pageUrl,
    }),
  }));

  const text = await response.text();
  if (!response.ok) {
    // Surface actionable details in DevTools without showing them to end users.
    console.error('ChatKit session error', response.status, text);
    throw new Error(`Chat session request failed (${response.status})`);
  }

  const data = text ? JSON.parse(text) : {};
  return data.client_secret;
}

export async function postLeadEmail({ endpoint, payload }) {
  const response = await fetch(endpoint, withFetchTimeout({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify(payload),
  }));

  const text = await response.text();
  return { response, text };
}
