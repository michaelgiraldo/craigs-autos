import type { LeadFollowupWorkerEvent } from './types.ts';

export type ParsedLeadFollowupWorkerEvent =
  | { ok: true; quoteRequestId: string }
  | { ok: false; reason: 'missing_quote_request_id' };

export function parseLeadFollowupWorkerEvent(
  event: LeadFollowupWorkerEvent,
): ParsedLeadFollowupWorkerEvent {
  const quoteRequestId =
    typeof event?.quote_request_id === 'string' ? event.quote_request_id.trim() : '';
  if (!quoteRequestId) return { ok: false, reason: 'missing_quote_request_id' };
  return { ok: true, quoteRequestId };
}
