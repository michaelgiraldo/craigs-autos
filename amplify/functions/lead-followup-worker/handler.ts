import { jsonResponse } from '../_shared/http.ts';
import { parseLeadFollowupWorkerEvent } from './event.ts';
import { processLeadFollowupWorker } from './process-lead-followup-worker.ts';
import { createLeadFollowupWorkerRuntime } from './runtime.ts';
import type { LambdaResult, LeadFollowupWorkerDeps, LeadFollowupWorkerEvent } from './types.ts';

function json(statusCode: number, body: unknown): LambdaResult {
  return jsonResponse(statusCode, body);
}

export function createLeadFollowupWorkerHandler(deps: LeadFollowupWorkerDeps) {
  return async (event: LeadFollowupWorkerEvent): Promise<LambdaResult> => {
    if (!deps.configValid) {
      return json(500, { error: 'Server missing configuration' });
    }

    const parsed = parseLeadFollowupWorkerEvent(event);
    if (!parsed.ok) {
      return json(400, { error: 'Missing idempotency_key' });
    }

    const outcome = await processLeadFollowupWorker({
      deps,
      idempotencyKey: parsed.idempotencyKey,
    });
    return json(outcome.statusCode, outcome.body);
  };
}

export const handler = createLeadFollowupWorkerHandler(createLeadFollowupWorkerRuntime());
