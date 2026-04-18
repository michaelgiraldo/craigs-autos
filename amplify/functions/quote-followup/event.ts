import type { QuoteFollowupEvent } from './types.ts';

export type ParsedQuoteFollowupEvent =
  | { ok: true; submissionId: string }
  | { ok: false; reason: 'missing_submission_id' };

export function parseQuoteFollowupEvent(event: QuoteFollowupEvent): ParsedQuoteFollowupEvent {
  const submissionId = typeof event?.submission_id === 'string' ? event.submission_id.trim() : '';
  if (!submissionId) return { ok: false, reason: 'missing_submission_id' };
  return { ok: true, submissionId };
}
