export const PUBLIC_API_CONTRACT = 'craigs-lead-api-v2';

export const PUBLIC_API_ROUTES = {
  quoteRequests: 'quote-requests',
  leadInteractions: 'lead-interactions',
  chatSessions: 'chat-sessions',
  chatHandoffs: 'chat-handoffs',
  leadActionLinks: 'lead-action-links',
  adminLeads: 'admin/leads',
  adminLeadQualification: 'admin/leads/qualification',
  adminLeadNotes: 'admin/leads/notes',
  adminLeadFollowupState: 'admin/leads/follow-up-state',
};

export function publicApiPath(route) {
  return `/${String(route || '').replace(/^\/+/, '')}`;
}
