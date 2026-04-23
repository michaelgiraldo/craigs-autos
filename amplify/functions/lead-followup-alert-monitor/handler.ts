import { jsonResponse } from '../_shared/http.ts';
import { processLeadFollowupAlertMonitor } from './process-lead-followup-alert-monitor.ts';
import { createLeadFollowupAlertMonitorRuntime } from './runtime.ts';

export type LeadFollowupAlertMonitorEvent = {
  batch_size?: unknown;
  idempotency_key?: unknown;
};

function parseOptionalIdempotencyKey(event: LeadFollowupAlertMonitorEvent): string | null {
  return typeof event.idempotency_key === 'string' && event.idempotency_key.trim()
    ? event.idempotency_key.trim()
    : null;
}

function parseOptionalBatchSize(event: LeadFollowupAlertMonitorEvent): number | undefined {
  if (typeof event.batch_size !== 'number' || !Number.isFinite(event.batch_size)) return undefined;
  return event.batch_size;
}

export function createLeadFollowupAlertMonitorHandler(
  runtime = createLeadFollowupAlertMonitorRuntime(),
) {
  return async (event: LeadFollowupAlertMonitorEvent = {}) => {
    if (!runtime.configValid) {
      return jsonResponse(500, { error: 'Server missing configuration' });
    }

    const result = await processLeadFollowupAlertMonitor({
      batchSize: parseOptionalBatchSize(event),
      deps: runtime,
      idempotencyKey: parseOptionalIdempotencyKey(event),
    });

    return jsonResponse(200, result);
  };
}

export const handler = createLeadFollowupAlertMonitorHandler();
