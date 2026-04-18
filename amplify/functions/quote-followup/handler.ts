import { jsonResponse } from '../_shared/http.ts';
import { parseQuoteFollowupEvent } from './event.ts';
import { processQuoteFollowup } from './process-quote-followup.ts';
import { createQuoteFollowupRuntime } from './runtime.ts';
import type { LambdaResult, QuoteFollowupDeps, QuoteFollowupEvent } from './types.ts';

function json(statusCode: number, body: unknown): LambdaResult {
  return jsonResponse(statusCode, body);
}

export function createQuoteFollowupHandler(deps: QuoteFollowupDeps) {
  return async (event: QuoteFollowupEvent): Promise<LambdaResult> => {
    if (!deps.configValid) {
      return json(500, { error: 'Server missing configuration' });
    }

    const parsed = parseQuoteFollowupEvent(event);
    if (!parsed.ok) {
      return json(400, { error: 'Missing submission_id' });
    }

    const outcome = await processQuoteFollowup({
      deps,
      submissionId: parsed.submissionId,
    });
    return json(outcome.statusCode, outcome.body);
  };
}

export const handler = createQuoteFollowupHandler(createQuoteFollowupRuntime());
