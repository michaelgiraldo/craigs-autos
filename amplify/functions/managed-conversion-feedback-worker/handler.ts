import { jsonResponse } from '../_shared/http.ts';
import { processManagedConversionFeedbackBatch } from '../_lead-platform/services/managed-conversion-feedback-worker.ts';
import { createManagedConversionFeedbackWorkerRuntime } from './runtime.ts';

export type ManagedConversionFeedbackWorkerEvent = {
  outbox_id?: unknown;
  batch_size?: unknown;
};

function parseOptionalOutboxId(event: ManagedConversionFeedbackWorkerEvent): string | null {
  return typeof event.outbox_id === 'string' && event.outbox_id.trim()
    ? event.outbox_id.trim()
    : null;
}

function parseOptionalBatchSize(event: ManagedConversionFeedbackWorkerEvent): number | undefined {
  if (typeof event.batch_size !== 'number' || !Number.isFinite(event.batch_size)) return undefined;
  return event.batch_size;
}

export function createManagedConversionFeedbackWorkerHandler(
  runtime = createManagedConversionFeedbackWorkerRuntime(),
) {
  return async (event: ManagedConversionFeedbackWorkerEvent = {}) => {
    if (!runtime.configValid || !runtime.repos) {
      return jsonResponse(500, { error: 'Server missing configuration' });
    }

    const result = await processManagedConversionFeedbackBatch({
      repos: runtime.repos,
      nowMs: runtime.nowMs(),
      workerId: runtime.createWorkerId(),
      providerResolver: runtime.providerCatalog,
      outboxId: parseOptionalOutboxId(event),
      config: {
        batchSize: parseOptionalBatchSize(event) ?? runtime.batchSize,
        leaseMs: runtime.leaseMs,
        maxAttempts: runtime.maxAttempts,
      },
    });

    return jsonResponse(200, result);
  };
}

export const handler = createManagedConversionFeedbackWorkerHandler();
