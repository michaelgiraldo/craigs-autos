export declare const PUBLIC_API_CONTRACT: 'craigs-lead-api-v1';

export declare const PUBLIC_API_ROUTES: {
  readonly contact: 'contact';
  readonly chatSession: 'chat/session';
  readonly chatHandoff: 'chat/handoff';
  readonly chatMessageLink: 'chat/message-link';
  readonly leadSignal: 'lead-signal';
  readonly adminLeads: 'admin/leads';
};

export type PublicApiRoute = (typeof PUBLIC_API_ROUTES)[keyof typeof PUBLIC_API_ROUTES];

export declare function publicApiPath(route: PublicApiRoute | string): string;
