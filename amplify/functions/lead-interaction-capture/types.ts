import type { LeadInteractionEventName } from '@craigs/contracts/lead-event-contract';

export type AllowedLeadInteractionEvent = LeadInteractionEventName;

export type LeadInteractionRequest = {
  event: string;
  journey_id?: string | null;
  client_event_id?: string | null;
  occurred_at_ms?: number | null;
  pageUrl?: string | null;
  pagePath?: string | null;
  user?: string | null;
  locale?: string | null;
  threadId?: string | null;
  clickUrl?: string | null;
  provider?: string | null;
  attribution?: unknown;
};
