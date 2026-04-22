import type {
  ManagedConversionDestinationKey,
  ManagedConversionFeedbackStatus,
} from '@craigs/contracts/managed-conversion-contract';
import type {
  LeadConversionFeedbackOutboxItem,
  LeadConversionFeedbackOutcome,
} from '../domain/conversion-feedback.ts';
import {
  createConversionFeedbackOutcomeId,
  createConversionFeedbackOutcomeSortKey,
} from '../domain/ids.ts';
import type { LeadPlatformRepos } from '../repos/dynamo.ts';
import type { ManagedConversionFeedbackDeliveryResult } from './conversion-feedback/adapter-types.ts';
import type { ManagedConversionFeedbackProviderResolver } from './conversion-feedback/provider-catalog.ts';

export const DEFAULT_CONVERSION_FEEDBACK_BATCH_SIZE = 10;
export const DEFAULT_CONVERSION_FEEDBACK_LEASE_MS = 5 * 60 * 1000;
export const DEFAULT_CONVERSION_FEEDBACK_MAX_ATTEMPTS = 3;

const DEFAULT_RETRY_DELAYS_MS = [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000];

export type ManagedConversionFeedbackWorkerConfig = {
  batchSize?: number;
  leaseMs?: number;
  maxAttempts?: number;
  retryDelaysMs?: number[];
};

export type ManagedConversionFeedbackWorkerResult = {
  ok: true;
  checked: number;
  processed: number;
  skipped: number;
  outcomes: Array<{
    outbox_id: string;
    destination_key: ManagedConversionDestinationKey;
    status: ManagedConversionFeedbackStatus;
    retried: boolean;
  }>;
};

function normalizeBatchSize(value: number | undefined): number {
  if (!Number.isFinite(value) || !value) return DEFAULT_CONVERSION_FEEDBACK_BATCH_SIZE;
  return Math.max(1, Math.min(100, Math.floor(value)));
}

function retryDelayForAttempt(attemptCount: number, retryDelaysMs: number[]): number {
  return retryDelaysMs[Math.min(Math.max(attemptCount - 1, 0), retryDelaysMs.length - 1)] ?? 0;
}

function terminalStatuses(): Set<ManagedConversionFeedbackStatus> {
  return new Set<ManagedConversionFeedbackStatus>([
    'validated',
    'manual',
    'sent',
    'accepted',
    'warning',
    'failed',
    'attributed',
    'suppressed',
    'retracted',
    'needs_destination_config',
    'needs_signal',
    'not_ready',
  ]);
}

function createOutcome(args: {
  item: LeadConversionFeedbackOutboxItem;
  status: ManagedConversionFeedbackStatus;
  message: string;
  nowMs: number;
  providerResponseId?: string | null;
  errorCode?: string | null;
  diagnosticsUrl?: string | null;
  payload?: Record<string, unknown>;
}): LeadConversionFeedbackOutcome {
  const outcomeId = createConversionFeedbackOutcomeId({
    outboxId: args.item.outbox_id,
    status: args.status,
    occurredAtMs: args.nowMs,
    discriminator: `${args.item.attempt_count}:${args.message}`,
  });

  return {
    outbox_id: args.item.outbox_id,
    outcome_sort_key: createConversionFeedbackOutcomeSortKey(args.nowMs, outcomeId),
    outcome_id: outcomeId,
    decision_id: args.item.decision_id,
    lead_record_id: args.item.lead_record_id,
    journey_id: args.item.journey_id,
    destination_key: args.item.destination_key,
    destination_label: args.item.destination_label,
    status: args.status,
    message: args.message,
    provider_response_id: args.providerResponseId ?? null,
    error_code: args.errorCode ?? null,
    diagnostics_url: args.diagnosticsUrl ?? null,
    occurred_at_ms: args.nowMs,
    recorded_at_ms: args.nowMs,
    payload: args.payload ?? {},
  };
}

function buildTerminalItem(args: {
  item: LeadConversionFeedbackOutboxItem;
  status: ManagedConversionFeedbackStatus;
  message: string;
  nowMs: number;
}): LeadConversionFeedbackOutboxItem {
  return {
    ...args.item,
    status: args.status,
    status_reason: args.message,
    lease_owner: null,
    lease_expires_at_ms: null,
    next_attempt_at_ms: null,
    last_outcome_at_ms: args.nowMs,
    updated_at_ms: args.nowMs,
  };
}

function buildRetryItem(args: {
  item: LeadConversionFeedbackOutboxItem;
  message: string;
  nextAttemptAtMs: number;
  nowMs: number;
}): LeadConversionFeedbackOutboxItem {
  return {
    ...args.item,
    status: 'queued',
    status_reason: args.message,
    lease_owner: null,
    lease_expires_at_ms: null,
    next_attempt_at_ms: args.nextAttemptAtMs,
    last_outcome_at_ms: args.nowMs,
    updated_at_ms: args.nowMs,
  };
}

async function completeAttempt(args: {
  repos: LeadPlatformRepos;
  item: LeadConversionFeedbackOutboxItem;
  result: ManagedConversionFeedbackDeliveryResult;
  nowMs: number;
  maxAttempts: number;
  retryDelaysMs: number[];
}): Promise<{ item: LeadConversionFeedbackOutboxItem; retried: boolean }> {
  const retryable = args.result.retryable === true;
  const canRetry = retryable && args.item.attempt_count < args.maxAttempts;
  const outcome = createOutcome({
    item: args.item,
    status: args.result.status,
    message: args.result.message,
    nowMs: args.nowMs,
    providerResponseId: args.result.providerResponseId,
    errorCode: args.result.errorCode,
    diagnosticsUrl: args.result.diagnosticsUrl,
    payload: {
      ...(args.result.payload ?? {}),
      attempt_count: args.item.attempt_count,
      retryable,
    },
  });
  const updatedItem = canRetry
    ? buildRetryItem({
        item: args.item,
        message: `${args.result.message} Retry scheduled.`,
        nextAttemptAtMs:
          args.nowMs + retryDelayForAttempt(args.item.attempt_count, args.retryDelaysMs),
        nowMs: args.nowMs,
      })
    : buildTerminalItem({
        item: args.item,
        status: args.result.status,
        message: args.result.message,
        nowMs: args.nowMs,
      });

  await args.repos.conversionFeedbackOutcomes.append(outcome);
  await args.repos.conversionFeedbackOutbox.put(updatedItem);

  return { item: updatedItem, retried: canRetry };
}

async function processLeasedItem(args: {
  repos: LeadPlatformRepos;
  item: LeadConversionFeedbackOutboxItem;
  providerResolver: ManagedConversionFeedbackProviderResolver;
  nowMs: number;
  maxAttempts: number;
  retryDelaysMs: number[];
}): Promise<{ item: LeadConversionFeedbackOutboxItem; retried: boolean }> {
  const decision = await args.repos.conversionDecisions.getById(args.item.decision_id);
  if (!decision) {
    return completeAttempt({
      repos: args.repos,
      item: args.item,
      result: {
        status: 'failed',
        message: 'Missing conversion decision; feedback cannot be delivered.',
        errorCode: 'missing_decision',
      },
      nowMs: args.nowMs,
      maxAttempts: args.maxAttempts,
      retryDelaysMs: args.retryDelaysMs,
    });
  }

  if (decision.decision_status !== 'active') {
    const status = decision.decision_status === 'retracted' ? 'retracted' : 'suppressed';
    return completeAttempt({
      repos: args.repos,
      item: args.item,
      result: {
        status,
        message: `Conversion decision is ${decision.decision_status}; feedback will not be delivered.`,
        errorCode: `decision_${decision.decision_status}`,
      },
      nowMs: args.nowMs,
      maxAttempts: args.maxAttempts,
      retryDelaysMs: args.retryDelaysMs,
    });
  }

  const leadRecord = await args.repos.leadRecords.getById(args.item.lead_record_id);
  if (!leadRecord) {
    return completeAttempt({
      repos: args.repos,
      item: args.item,
      result: {
        status: 'failed',
        message: 'Missing lead record; feedback cannot be delivered.',
        errorCode: 'missing_lead_record',
      },
      nowMs: args.nowMs,
      maxAttempts: args.maxAttempts,
      retryDelaysMs: args.retryDelaysMs,
    });
  }

  const contact = leadRecord.contact_id
    ? await args.repos.contacts.getById(leadRecord.contact_id)
    : null;

  const destination = await args.repos.providerConversionDestinations.getByKey(
    args.item.destination_key,
  );
  if (!destination?.enabled) {
    return completeAttempt({
      repos: args.repos,
      item: args.item,
      result: {
        status: 'needs_destination_config',
        message: 'Feedback destination is not enabled or configured.',
        errorCode: 'destination_not_configured',
      },
      nowMs: args.nowMs,
      maxAttempts: args.maxAttempts,
      retryDelaysMs: args.retryDelaysMs,
    });
  }

  const adapter = args.providerResolver.getAdapter(destination.destination_key);
  if (!adapter) {
    return completeAttempt({
      repos: args.repos,
      item: args.item,
      result: {
        status: 'needs_destination_config',
        message: `No conversion feedback provider is configured for ${destination.destination_label}.`,
        errorCode: 'provider_not_configured',
        payload: {
          delivery_mode: destination.delivery_mode,
        },
      },
      nowMs: args.nowMs,
      maxAttempts: args.maxAttempts,
      retryDelaysMs: args.retryDelaysMs,
    });
  }

  try {
    const result = await adapter.deliver({
      item: args.item,
      decision,
      destination,
      leadRecord,
      contact,
      nowMs: args.nowMs,
    });
    return completeAttempt({
      repos: args.repos,
      item: args.item,
      result,
      nowMs: args.nowMs,
      maxAttempts: args.maxAttempts,
      retryDelaysMs: args.retryDelaysMs,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown provider adapter error.';
    return completeAttempt({
      repos: args.repos,
      item: args.item,
      result: {
        status: 'failed',
        message,
        errorCode: 'adapter_exception',
        retryable: true,
      },
      nowMs: args.nowMs,
      maxAttempts: args.maxAttempts,
      retryDelaysMs: args.retryDelaysMs,
    });
  }
}

export async function processManagedConversionFeedbackBatch(args: {
  repos: LeadPlatformRepos;
  nowMs: number;
  workerId: string;
  providerResolver: ManagedConversionFeedbackProviderResolver;
  config?: ManagedConversionFeedbackWorkerConfig;
  outboxId?: string | null;
}): Promise<ManagedConversionFeedbackWorkerResult> {
  const batchSize = normalizeBatchSize(args.config?.batchSize);
  const leaseMs = args.config?.leaseMs ?? DEFAULT_CONVERSION_FEEDBACK_LEASE_MS;
  const maxAttempts = args.config?.maxAttempts ?? DEFAULT_CONVERSION_FEEDBACK_MAX_ATTEMPTS;
  const retryDelaysMs = args.config?.retryDelaysMs?.length
    ? args.config.retryDelaysMs
    : DEFAULT_RETRY_DELAYS_MS;
  const candidates = args.outboxId
    ? [await args.repos.conversionFeedbackOutbox.getById(args.outboxId)]
    : await args.repos.conversionFeedbackOutbox.listByStatus('queued', {
        dueAtMs: args.nowMs,
        limit: batchSize,
      });
  const outcomes: ManagedConversionFeedbackWorkerResult['outcomes'] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    if (!candidate) {
      skipped += 1;
      continue;
    }

    if (candidate.status !== 'queued' || terminalStatuses().has(candidate.status)) {
      skipped += 1;
      continue;
    }

    if (
      typeof candidate.next_attempt_at_ms === 'number' &&
      candidate.next_attempt_at_ms > args.nowMs
    ) {
      skipped += 1;
      continue;
    }

    const leasedItem = await args.repos.conversionFeedbackOutbox.acquireLease({
      outboxId: candidate.outbox_id,
      expectedStatus: 'queued',
      leaseOwner: args.workerId,
      leaseExpiresAtMs: args.nowMs + leaseMs,
      nowMs: args.nowMs,
      statusReason: `Leased by ${args.workerId}.`,
    });

    if (!leasedItem) {
      skipped += 1;
      continue;
    }

    const processed = await processLeasedItem({
      repos: args.repos,
      item: leasedItem,
      providerResolver: args.providerResolver,
      nowMs: args.nowMs,
      maxAttempts,
      retryDelaysMs,
    });

    outcomes.push({
      outbox_id: processed.item.outbox_id,
      destination_key: processed.item.destination_key,
      status: processed.item.status,
      retried: processed.retried,
    });
  }

  return {
    ok: true,
    checked: candidates.length,
    processed: outcomes.length,
    skipped,
    outcomes,
  };
}
