import { AMPLIFY_OUTPUTS_PATH } from './constants.js';

const NETWORK_FETCH_TIMEOUT_MS = 8_000;
const CHAT_SESSION_ROUTE = 'chat/session';
const CHAT_HANDOFF_ROUTE = 'chat/handoff';

function withFetchTimeout(init = {}) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { ...init, signal: AbortSignal.timeout(NETWORK_FETCH_TIMEOUT_MS) };
  }
  return init;
}

export function isPlaceholderUrl(value) {
  return typeof value === 'string' && value.includes('<your-backend>');
}

export function shouldLoadAmplifyOutputs({ sessionUrl, leadHandoffUrl }) {
  return (
    typeof sessionUrl !== 'string' ||
    isPlaceholderUrl(sessionUrl) ||
    sessionUrl.startsWith('/') ||
    typeof leadHandoffUrl !== 'string' ||
    isPlaceholderUrl(leadHandoffUrl) ||
    leadHandoffUrl.startsWith('/')
  );
}

function buildPublicApiUrl(apiBaseUrl, route) {
  if (typeof apiBaseUrl !== 'string' || !apiBaseUrl.trim()) return null;
  const normalizedBase = apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`;
  return new URL(route, normalizedBase).toString();
}

export async function fetchAmplifyOutputsUrls() {
  try {
    const response = await fetch(AMPLIFY_OUTPUTS_PATH, withFetchTimeout({ cache: 'no-store' }));
    if (!response.ok) return null;
    const data = await response.json();

    const apiBaseUrl = data?.custom?.api_base_url;
    const sessionCandidate = buildPublicApiUrl(apiBaseUrl, CHAT_SESSION_ROUTE);
    const leadCandidate = buildPublicApiUrl(apiBaseUrl, CHAT_HANDOFF_ROUTE);

    return {
      sessionUrl:
        typeof sessionCandidate === 'string' && sessionCandidate.trim()
          ? sessionCandidate.trim()
          : null,
      leadHandoffUrl:
        typeof leadCandidate === 'string' && leadCandidate.trim() ? leadCandidate.trim() : null,
    };
  } catch {
    return null;
  }
}

export async function resolveSessionEndpoint({ isDev, endpoint, onSessionUrl, onLeadHandoffUrl }) {
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
    if (outputs?.leadHandoffUrl) {
      onLeadHandoffUrl?.(outputs.leadHandoffUrl);
    }
  }

  return resolvedEndpoint;
}

export async function resolveLeadHandoffEndpoint({ isDev, endpoint, onLeadHandoffUrl }) {
  let resolvedEndpoint = endpoint;
  if (
    !isDev &&
    (typeof resolvedEndpoint !== 'string' ||
      isPlaceholderUrl(resolvedEndpoint) ||
      resolvedEndpoint.startsWith('/'))
  ) {
    const outputs = await fetchAmplifyOutputsUrls();
    if (outputs?.leadHandoffUrl) {
      resolvedEndpoint = outputs.leadHandoffUrl;
      onLeadHandoffUrl?.(outputs.leadHandoffUrl);
    }
  }
  return resolvedEndpoint;
}

export async function requestClientSecret({ endpoint, current, locale, userId, pageUrl }) {
  const response = await fetch(
    endpoint,
    withFetchTimeout({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current,
        locale,
        user: userId ?? 'anonymous',
        pageUrl,
      }),
    }),
  );

  const text = await response.text();
  if (!response.ok) {
    // Surface actionable details in DevTools without showing them to end users.
    console.error('ChatKit session error', response.status, text);
    throw new Error(`Chat session request failed (${response.status})`);
  }

  const data = text ? JSON.parse(text) : {};
  if (typeof data.client_secret !== 'string' || !data.client_secret.trim()) {
    throw new Error('Chat session response missing client_secret');
  }
  return data.client_secret;
}

export async function postLeadHandoff({ endpoint, payload }) {
  const response = await fetch(
    endpoint,
    withFetchTimeout({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(payload),
    }),
  );

  const text = await response.text();
  return { response, text };
}
