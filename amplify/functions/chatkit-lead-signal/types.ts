export type AllowedLeadSignalEvent =
  | 'lead_chat_first_message_sent'
  | 'lead_click_to_call'
  | 'lead_click_to_text'
  | 'lead_click_email'
  | 'lead_click_directions';

export type LeadSignalRequest = {
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
