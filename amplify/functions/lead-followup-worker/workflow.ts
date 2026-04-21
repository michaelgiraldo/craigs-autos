import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import { runEmailFollowupWorkflow } from './email-workflow.ts';
import { runFormFollowupWorkflow } from './form-workflow.ts';
import type { LeadFollowupWorkerDeps, LeadFollowupWorkflowOutcome } from './types.ts';
import { getOutreachResult, isEmailFirst } from './workflow-common.ts';

export { getOutreachResult };

export async function runLeadFollowupWorkerWorkflow(args: {
  deps: LeadFollowupWorkerDeps;
  record: LeadFollowupWorkItem;
  followupWorkId: string;
}): Promise<LeadFollowupWorkflowOutcome> {
  return isEmailFirst(args.record) ? runEmailFollowupWorkflow(args) : runFormFollowupWorkflow(args);
}
