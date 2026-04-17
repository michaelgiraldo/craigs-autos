const OUTPUTS_PATH = '/amplify_outputs.json';

type AmplifyOutputs = {
  custom?: Record<string, unknown>;
};

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

export async function resolveBackendUrl(key: string): Promise<string | null> {
  const outputs = await loadAmplifyOutputs();
  const candidate = outputs?.custom?.[key];
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

export function resetAmplifyOutputsCache() {
  outputsPromise = null;
}

export function resolveContactSubmitUrl() {
  return resolveBackendUrl('contact_submit_url');
}

export function resolveChatkitSessionUrl() {
  return resolveBackendUrl('chatkit_session_url');
}

export function resolveChatLeadHandoffUrl() {
  return resolveBackendUrl('chat_lead_handoff_url');
}

export function resolveChatkitLeadSignalUrl() {
  return resolveBackendUrl('chatkit_lead_signal_url');
}

export function resolveChatkitLeadAdminUrl() {
  return resolveBackendUrl('chatkit_lead_admin_url');
}

export function resolveChatkitMessageLinkUrl() {
  return resolveBackendUrl('chatkit_message_link_url');
}
