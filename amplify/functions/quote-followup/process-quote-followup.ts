import { randomUUID } from 'node:crypto';
import type { QuoteSubmissionRecord } from '../_lead-core/domain/quote-request.ts';
import type { QuoteFollowupDeps, QuoteWorkflowOutcome } from './types.ts';
import { runQuoteFollowupWorkflow } from './workflow.ts';

export const QUOTE_LEASE_SECONDS = 5 * 60;

function buildProcessingRecord(args: {
  existing: QuoteSubmissionRecord;
  leaseExpiresAt: number;
  leaseId: string;
  nowEpoch: number;
}): QuoteSubmissionRecord {
  return {
    ...args.existing,
    status: 'processing',
    lease_id: args.leaseId,
    lock_expires_at: args.leaseExpiresAt,
    updated_at: args.nowEpoch,
  };
}

export async function processQuoteFollowup(args: {
  deps: QuoteFollowupDeps;
  submissionId: string;
}): Promise<QuoteWorkflowOutcome> {
  const { deps, submissionId } = args;
  const now = deps.nowEpochSeconds();
  const existing = await deps.getSubmission(submissionId);

  if (!existing) {
    return { statusCode: 404, body: { error: 'Submission not found' } };
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
    submissionId,
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
  const outcome = await runQuoteFollowupWorkflow({
    deps,
    record,
    submissionId,
  });

  if (deps.syncLeadRecord) {
    try {
      await deps.syncLeadRecord(record);
    } catch (error: unknown) {
      console.error('Failed to sync lead record from quote follow-up.', error);
    }
  }

  return outcome;
}
