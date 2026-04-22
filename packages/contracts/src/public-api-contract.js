export const PUBLIC_API_CONTRACT = 'craigs-lead-api-v2';

export const PUBLIC_API_ROUTES = {
  quoteRequests: 'quote-requests',
  leadAttachmentUploadTargets: 'lead-attachments/upload-targets',
  leadInteractions: 'lead-interactions',
  chatSessions: 'chat-sessions',
  chatHandoffs: 'chat-handoffs',
  leadActionLinks: 'lead-action-links',
  adminLeads: 'admin/leads',
  adminLeadQualification: 'admin/leads/qualification',
  adminFollowupRetry: 'admin/leads/followup-work/retry',
  adminFollowupManual: 'admin/leads/followup-work/manual',
};

export function publicApiPath(route) {
  return `/${String(route || '').replace(/^\/+/, '')}`;
}
