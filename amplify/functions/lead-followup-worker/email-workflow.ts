import type { QuoteRequestRecord } from '../_lead-platform/domain/quote-request.ts';
import type { LeadFollowupWorkerDeps, QuoteWorkflowOutcome } from './types.ts';
import {
  attemptEmailOutreach,
  completeWorkflow,
  ensureDrafts,
  failWorkflow,
  getUsableEmail,
  skipSmsForEmailFirst,
} from './workflow-common.ts';

export async function runEmailFollowupWorkflow(args: {
  deps: LeadFollowupWorkerDeps;
  record: QuoteRequestRecord;
  quoteRequestId: string;
}): Promise<QuoteWorkflowOutcome> {
  const { deps, record, quoteRequestId } = args;

  try {
    await ensureDrafts(deps, record);
    await skipSmsForEmailFirst(deps, record);
    await attemptEmailOutreach(deps, record, null, getUsableEmail(record));

    return await completeWorkflow({ deps, quoteRequestId, record });
  } catch (error: unknown) {
    return failWorkflow({ deps, record, error });
  }
}
