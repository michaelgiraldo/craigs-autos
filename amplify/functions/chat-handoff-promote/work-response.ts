import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import type { ChatHandoffResponse } from './lead-types.ts';

export function existingWorkResponse(existingWork: LeadFollowupWorkItem): ChatHandoffResponse {
  const isCompleted = existingWork.status === 'completed';
  const isError = existingWork.status === 'error';

  return {
    ok: true,
    status: isCompleted ? 'worker_completed' : isError ? 'worker_failed' : 'already_accepted',
    reason: isCompleted ? 'already_completed' : isError ? 'followup_error' : 'followup_in_progress',
    followup_work_id: existingWork.followup_work_id,
    followup_work_status: existingWork.status,
    ...(existingWork.lead_record_id ? { lead_record_id: existingWork.lead_record_id } : {}),
  };
}
