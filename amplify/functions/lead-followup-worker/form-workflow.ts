import { phoneToE164 } from '../_shared/text-utils.ts';
import type { LeadFollowupWorkerDeps, LeadFollowupWorkflowOutcome } from './types.ts';
import {
  attemptEmailOutreach,
  attemptSmsOutreach,
  completeWorkflow,
  ensureDrafts,
  failWorkflow,
  getUsableEmail,
} from './workflow-common.ts';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';

export async function runFormFollowupWorkflow(args: {
  deps: LeadFollowupWorkerDeps;
  record: LeadFollowupWorkItem;
  followupWorkId: string;
}): Promise<LeadFollowupWorkflowOutcome> {
  const { deps, record, followupWorkId } = args;

  try {
    await ensureDrafts(deps, record);

    const usablePhone = phoneToE164(record.phone);
    const usableEmail = getUsableEmail(record);

    await attemptSmsOutreach(deps, record, usablePhone);
    await attemptEmailOutreach(deps, record, usablePhone, usableEmail);

    return await completeWorkflow({ deps, followupWorkId, record });
  } catch (error: unknown) {
    return failWorkflow({ deps, record, error });
  }
}
