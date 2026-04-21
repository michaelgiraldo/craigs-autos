import type { LeadAdminDeps, LeadFollowupWorkActionRequest } from './types.ts';

export async function retryLeadFollowupWork(
  deps: LeadAdminDeps,
  request: LeadFollowupWorkActionRequest,
) {
  return deps.retryFollowupWork({
    idempotencyKey: request.idempotencyKey,
    nowEpochSeconds: Math.floor(deps.nowEpochMs() / 1000),
  });
}

export async function resolveLeadFollowupWorkManually(
  deps: LeadAdminDeps,
  request: LeadFollowupWorkActionRequest,
) {
  return deps.resolveFollowupWorkManually({
    idempotencyKey: request.idempotencyKey,
    nowEpochSeconds: Math.floor(deps.nowEpochMs() / 1000),
    reason: request.reason,
  });
}
