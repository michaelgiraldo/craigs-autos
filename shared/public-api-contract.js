export const PUBLIC_API_CONTRACT = 'craigs-lead-api-v1';

export const PUBLIC_API_ROUTES = {
  contact: 'contact',
  chatSession: 'chat/session',
  chatHandoff: 'chat/handoff',
  chatMessageLink: 'chat/message-link',
  leadSignal: 'lead-signal',
  adminLeads: 'admin/leads',
};

export function publicApiPath(route) {
  return `/${String(route || '').replace(/^\/+/, '')}`;
}
