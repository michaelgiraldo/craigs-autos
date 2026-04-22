import {
  PUBLIC_API_CONTRACT,
  PUBLIC_API_ROUTES,
  type PublicApiRoute,
} from '@craigs/contracts/public-api-contract';

const OUTPUTS_PATH = '/amplify_outputs.json';
const FETCH_TIMEOUT_MS = 8_000;

type AmplifyOutputs = {
  custom?: Record<string, unknown>;
};

let outputsPromise: Promise<AmplifyOutputs | null> | null = null;

export function withFetchTimeout(options: RequestInit = {}): RequestInit {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
  }
  return options;
}

async function loadAmplifyOutputs(): Promise<AmplifyOutputs | null> {
  if (!outputsPromise) {
    outputsPromise = fetch(OUTPUTS_PATH, withFetchTimeout({ cache: 'no-store' }))
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as AmplifyOutputs;
        return data && typeof data === 'object' ? data : null;
      })
      .then((data) => {
        if (!data) {
          outputsPromise = null;
        }
        return data;
      })
      .catch(() => {
        outputsPromise = null;
        return null;
      });
  }

  return outputsPromise;
}

function isExpectedApiContract(value: unknown): boolean {
  return value === PUBLIC_API_CONTRACT;
}

export function buildPublicApiUrl(apiBaseUrl: unknown, route: PublicApiRoute): string | null {
  if (typeof apiBaseUrl !== 'string' || !apiBaseUrl.trim()) return null;
  const normalizedBase = apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`;
  return new URL(route.replace(/^\/+/, ''), normalizedBase).toString();
}

export async function resolvePublicApiBaseUrl(): Promise<string | null> {
  const outputs = await loadAmplifyOutputs();
  const custom = outputs?.custom;
  if (!custom || !isExpectedApiContract(custom.api_contract)) return null;
  const candidate = custom.api_base_url;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

export async function resolvePublicApiUrl(route: PublicApiRoute): Promise<string | null> {
  const apiBaseUrl = await resolvePublicApiBaseUrl();
  return buildPublicApiUrl(apiBaseUrl, route);
}

export async function resolvePublicApiUrls<T extends Record<string, PublicApiRoute>>(
  routes: T,
): Promise<{ [K in keyof T]: string | null }> {
  const apiBaseUrl = await resolvePublicApiBaseUrl();
  return Object.fromEntries(
    Object.entries(routes).map(([key, route]) => [key, buildPublicApiUrl(apiBaseUrl, route)]),
  ) as { [K in keyof T]: string | null };
}

export function resetPublicApiOutputsCache() {
  outputsPromise = null;
}

export function resolveQuoteRequestSubmitUrl() {
  return resolvePublicApiUrl(PUBLIC_API_ROUTES.quoteRequests);
}

export function resolveLeadAttachmentUploadTargetsUrl() {
  return resolvePublicApiUrl(PUBLIC_API_ROUTES.leadAttachmentUploadTargets);
}
