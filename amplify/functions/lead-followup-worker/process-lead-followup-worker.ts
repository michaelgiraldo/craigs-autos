import { randomUUID } from 'node:crypto';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import type { LeadFollowupWorkerDeps, LeadFollowupWorkflowOutcome } from './types.ts';
import { runLeadFollowupWorkerWorkflow } from './workflow.ts';

export const LEAD_FOLLOWUP_LEASE_SECONDS = 5 * 60;

function buildProcessingRecord(args: {
  existing: LeadFollowupWorkItem;
  leaseExpiresAt: number;
  leaseId: string;
  nowEpoch: number;
}): LeadFollowupWorkItem {
  return {
    ...args.existing,
    status: 'processing',
    lease_id: args.leaseId,
    lock_expires_at: args.leaseExpiresAt,
    updated_at: args.nowEpoch,
  };
}

export async function processLeadFollowupWorker(args: {
  deps: LeadFollowupWorkerDeps;
  idempotencyKey: string;
}): Promise<LeadFollowupWorkflowOutcome> {
  const { deps, idempotencyKey } = args;
  const now = deps.nowEpochSeconds();
  const existing = await deps.getFollowupWork(idempotencyKey);

  if (!existing) {
    return { statusCode: 404, body: { error: 'Follow-up work not found' } };
  }

  if (existing.status === 'completed') {
    return { statusCode: 200, body: { ok: true, skipped: true, reason: 'already_completed' } };
  }

  if (existing.status === 'processing' && (existing.lock_expires_at ?? 0) > now) {
    return { statusCode: 200, body: { ok: true, skipped: true, reason: 'in_progress' } };
  }

  const leaseId = deps.createLeaseId ? deps.createLeaseId() : randomUUID();
  const leaseExpiresAt = now + LEAD_FOLLOWUP_LEASE_SECONDS;
  const leaseAcquired = await deps.acquireLease({
    idempotencyKey,
    leaseId,
    nowEpoch: now,
    leaseExpiresAt,
  });

  if (!leaseAcquired) {
    return { statusCode: 200, body: { ok: true, skipped: true, reason: 'lease_not_acquired' } };
  }

  const record = buildProcessingRecord({
    existing,
    leaseExpiresAt,
    leaseId,
    nowEpoch: now,
  });
  const outcome = await runLeadFollowupWorkerWorkflow({
    deps,
    record,
    followupWorkId: existing.followup_work_id,
  });

  if (deps.syncLeadRecord && outcome.body.reason !== 'stale_lease') {
    try {
      await deps.syncLeadRecord(record);
    } catch (error: unknown) {
      console.error('Failed to sync lead record from lead follow-up.', error);
    }
  }

  return outcome;
}
