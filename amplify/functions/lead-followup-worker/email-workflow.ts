import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import type { LeadFollowupWorkerDeps, LeadFollowupWorkflowOutcome } from './types.ts';
import {
  attemptEmailOutreach,
  completeWorkflow,
  ensureDrafts,
  failWorkflow,
  getUsableEmail,
  requiresManualCustomerResponseReview,
  skipCustomerOutreachForManualReview,
  skipSmsForEmailFirst,
} from './workflow-common.ts';

export async function runEmailFollowupWorkflow(args: {
  deps: LeadFollowupWorkerDeps;
  record: LeadFollowupWorkItem;
  followupWorkId: string;
}): Promise<LeadFollowupWorkflowOutcome> {
  const { deps, record, followupWorkId } = args;

  try {
    if (requiresManualCustomerResponseReview(record)) {
      await skipCustomerOutreachForManualReview(deps, record);
      return await completeWorkflow({ deps, followupWorkId, record });
    }

    await ensureDrafts(deps, record);
    await skipSmsForEmailFirst(deps, record);
    await attemptEmailOutreach(deps, record, null, getUsableEmail(record));

    return await completeWorkflow({ deps, followupWorkId, record });
  } catch (error: unknown) {
    return failWorkflow({ deps, record, error });
  }
}
