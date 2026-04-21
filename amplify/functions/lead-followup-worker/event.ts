import type { LeadFollowupWorkerEvent } from './types.ts';

export type ParsedLeadFollowupWorkerEvent =
  | { ok: true; followupWorkId: string }
  | { ok: false; reason: 'missing_followup_work_id' };

export function parseLeadFollowupWorkerEvent(
  event: LeadFollowupWorkerEvent,
): ParsedLeadFollowupWorkerEvent {
  const followupWorkId =
    typeof event?.followup_work_id === 'string' ? event.followup_work_id.trim() : '';
  if (!followupWorkId) return { ok: false, reason: 'missing_followup_work_id' };
  return { ok: true, followupWorkId };
}
