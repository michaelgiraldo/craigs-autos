import type { CraigsBackend } from './types';
import type { BackendFunctionUrls } from './function-urls';

export function addBackendOutputs(backend: CraigsBackend, functionUrls: BackendFunctionUrls): void {
  backend.addOutput({
    custom: {
      // Used by the contact page form to submit quote requests.
      contact_submit_url: functionUrls.contactSubmitUrl.url,
      // Used by the frontend widget (via /amplify_outputs.json) to locate the session endpoint.
      chatkit_session_url: functionUrls.chatkitSessionUrl.url,
      // Used by the frontend widget to hand ready ChatKit threads into the lead workflow.
      chat_lead_handoff_url: functionUrls.chatLeadHandoffUrl.url,
      // Used by /message/?token=... to resolve tokens into message drafts.
      chatkit_message_link_url: functionUrls.chatkitMessageLinkUrl.url,
      // Used by the frontend to log lead signals (tel/sms/directions clicks).
      chatkit_lead_signal_url: functionUrls.chatkitLeadSignalUrl.url,
      // Used by the admin UI to fetch and qualify leads.
      chatkit_lead_admin_url: functionUrls.chatkitLeadAdminUrl.url,
    },
  });
}
