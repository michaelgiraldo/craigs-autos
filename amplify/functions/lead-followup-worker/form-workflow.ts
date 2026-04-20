import { phoneToE164 } from '../_shared/text-utils.ts';
import type { LeadFollowupWorkerDeps, QuoteWorkflowOutcome } from './types.ts';
import {
  attemptEmailOutreach,
  attemptSmsOutreach,
  completeWorkflow,
  ensureDrafts,
  failWorkflow,
  getUsableEmail,
} from './workflow-common.ts';
import type { QuoteRequestRecord } from '../_lead-platform/domain/quote-request.ts';

export async function runFormFollowupWorkflow(args: {
  deps: LeadFollowupWorkerDeps;
  record: QuoteRequestRecord;
  quoteRequestId: string;
}): Promise<QuoteWorkflowOutcome> {
  const { deps, record, quoteRequestId } = args;

  try {
    await ensureDrafts(deps, record);

    const usablePhone = phoneToE164(record.phone);
    const usableEmail = getUsableEmail(record);

    await attemptSmsOutreach(deps, record, usablePhone);
    await attemptEmailOutreach(deps, record, usablePhone, usableEmail);

    return await completeWorkflow({ deps, quoteRequestId, record });
  } catch (error: unknown) {
    return failWorkflow({ deps, record, error });
  }
}
