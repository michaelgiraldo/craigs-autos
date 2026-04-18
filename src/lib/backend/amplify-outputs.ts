const OUTPUTS_PATH = '/amplify_outputs.json';

type AmplifyOutputs = {
  custom?: Record<string, unknown>;
};

const PUBLIC_API_ROUTES = {
  contact: 'contact',
  chatSession: 'chat/session',
  chatHandoff: 'chat/handoff',
  leadSignal: 'lead-signal',
  adminLeads: 'admin/leads',
  messageLink: 'chat/message-link',
} as const;

let outputsPromise: Promise<AmplifyOutputs | null> | null = null;

async function loadAmplifyOutputs(): Promise<AmplifyOutputs | null> {
  if (!outputsPromise) {
    outputsPromise = fetch(OUTPUTS_PATH, { cache: 'no-store' })
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

export async function resolvePublicApiBaseUrl(): Promise<string | null> {
  const outputs = await loadAmplifyOutputs();
  const candidate = outputs?.custom?.api_base_url;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

export async function resolvePublicApiRoute(route: string): Promise<string | null> {
  const apiBaseUrl = await resolvePublicApiBaseUrl();
  if (!apiBaseUrl) return null;
  const normalizedBase = apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`;
  return new URL(route.replace(/^\/+/, ''), normalizedBase).toString();
}

export function resetAmplifyOutputsCache() {
  outputsPromise = null;
}

export function resolveContactSubmitUrl() {
  return resolvePublicApiRoute(PUBLIC_API_ROUTES.contact);
}

export function resolveChatkitSessionUrl() {
  return resolvePublicApiRoute(PUBLIC_API_ROUTES.chatSession);
}

export function resolveChatLeadHandoffUrl() {
  return resolvePublicApiRoute(PUBLIC_API_ROUTES.chatHandoff);
}

export function resolveChatkitLeadSignalUrl() {
  return resolvePublicApiRoute(PUBLIC_API_ROUTES.leadSignal);
}

export function resolveChatkitLeadAdminUrl() {
  return resolvePublicApiRoute(PUBLIC_API_ROUTES.adminLeads);
}

export function resolveChatkitMessageLinkUrl() {
  return resolvePublicApiRoute(PUBLIC_API_ROUTES.messageLink);
}
