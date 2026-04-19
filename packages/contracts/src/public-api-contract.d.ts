export declare const PUBLIC_API_CONTRACT: 'craigs-lead-api-v2';

export declare const PUBLIC_API_ROUTES: {
  readonly quoteRequests: 'quote-requests';
  readonly leadInteractions: 'lead-interactions';
  readonly chatSessions: 'chat-sessions';
  readonly chatHandoffs: 'chat-handoffs';
  readonly leadActionLinks: 'lead-action-links';
  readonly adminLeads: 'admin/leads';
  readonly adminLeadQualification: 'admin/leads/qualification';
  readonly adminLeadNotes: 'admin/leads/notes';
  readonly adminLeadFollowupState: 'admin/leads/follow-up-state';
};

export type PublicApiRoute = (typeof PUBLIC_API_ROUTES)[keyof typeof PUBLIC_API_ROUTES];

export declare function publicApiPath(route: PublicApiRoute | string): string;
