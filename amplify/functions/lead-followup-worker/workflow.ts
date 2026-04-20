import type { QuoteRequestRecord } from '../_lead-platform/domain/quote-request.ts';
import { runEmailFollowupWorkflow } from './email-workflow.ts';
import { runFormFollowupWorkflow } from './form-workflow.ts';
import type { LeadFollowupWorkerDeps, QuoteWorkflowOutcome } from './types.ts';
import { getOutreachResult, isEmailFirst } from './workflow-common.ts';

export { getOutreachResult };

export async function runLeadFollowupWorkerWorkflow(args: {
  deps: LeadFollowupWorkerDeps;
  record: QuoteRequestRecord;
  quoteRequestId: string;
}): Promise<QuoteWorkflowOutcome> {
  return isEmailFirst(args.record) ? runEmailFollowupWorkflow(args) : runFormFollowupWorkflow(args);
}
