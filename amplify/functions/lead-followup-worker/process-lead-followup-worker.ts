import { randomUUID } from 'node:crypto';
import type { QuoteRequestRecord } from '../_lead-platform/domain/quote-request.ts';
import type { LeadFollowupWorkerDeps, QuoteWorkflowOutcome } from './types.ts';
import { runLeadFollowupWorkerWorkflow } from './workflow.ts';

export const QUOTE_LEASE_SECONDS = 5 * 60;

function buildProcessingRecord(args: {
  existing: QuoteRequestRecord;
  leaseExpiresAt: number;
  leaseId: string;
  nowEpoch: number;
}): QuoteRequestRecord {
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
  quoteRequestId: string;
}): Promise<QuoteWorkflowOutcome> {
  const { deps, quoteRequestId } = args;
  const now = deps.nowEpochSeconds();
  const existing = await deps.getQuoteRequest(quoteRequestId);

  if (!existing) {
    return { statusCode: 404, body: { error: 'Quote request not found' } };
  }

  if (existing.status === 'completed') {
    return { statusCode: 200, body: { ok: true, skipped: true, reason: 'already_completed' } };
  }

  if (existing.status === 'processing' && (existing.lock_expires_at ?? 0) > now) {
    return { statusCode: 200, body: { ok: true, skipped: true, reason: 'in_progress' } };
  }

  const leaseId = deps.createLeaseId ? deps.createLeaseId() : randomUUID();
  const leaseExpiresAt = now + QUOTE_LEASE_SECONDS;
  const leaseAcquired = await deps.acquireLease({
    quoteRequestId,
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
    quoteRequestId,
  });

  if (deps.syncLeadRecord) {
    try {
      await deps.syncLeadRecord(record);
    } catch (error: unknown) {
      console.error('Failed to sync lead record from lead follow-up.', error);
    }
  }

  return outcome;
}
