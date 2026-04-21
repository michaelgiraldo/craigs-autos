import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';

const COMPLETED_HANDOFF_STATUSES = new Set([
  'accepted',
  'already_accepted',
  'worker_completed',
]);

export function isCompletedChatHandoffStatus(status: string): boolean {
  return COMPLETED_HANDOFF_STATUSES.has(status);
}

export function getChatHandoffEventForStatus(status: string): string {
  if (isCompletedChatHandoffStatus(status)) return LEAD_EVENTS.chatHandoffCompleted;
  if (status === 'blocked') return LEAD_EVENTS.chatHandoffBlocked;
  if (status === 'deferred') return LEAD_EVENTS.chatHandoffDeferred;
  return LEAD_EVENTS.chatHandoffError;
}
