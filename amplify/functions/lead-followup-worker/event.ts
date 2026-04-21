import type { LeadFollowupWorkerEvent } from './types.ts';

export type ParsedLeadFollowupWorkerEvent =
  | { ok: true; idempotencyKey: string }
  | { ok: false; reason: 'missing_idempotency_key' };

export function parseLeadFollowupWorkerEvent(
  event: LeadFollowupWorkerEvent,
): ParsedLeadFollowupWorkerEvent {
  const idempotencyKey =
    typeof event?.idempotency_key === 'string' ? event.idempotency_key.trim() : '';
  if (!idempotencyKey) return { ok: false, reason: 'missing_idempotency_key' };
  return { ok: true, idempotencyKey };
}
