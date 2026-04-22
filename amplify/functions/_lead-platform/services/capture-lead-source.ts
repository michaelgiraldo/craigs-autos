import type { LeadFollowupWorkItem, LeadFollowupWorkStatus } from '../domain/lead-followup-work.ts';
import type { LeadPlatformRepos } from '../repos/dynamo.ts';
import { getErrorDetails } from '../../_shared/safe.ts';

export type PersistedLeadContext = {
  contactId: string | null;
  journeyId: string | null;
  leadRecordId: string | null;
};

export type LeadSourceCaptureStatus =
  | 'accepted'
  | 'already_accepted'
  | 'worker_failed'
  | 'worker_completed';

export type LeadSourceCaptureReceipt = {
  status: LeadSourceCaptureStatus;
  followupWorkId: string;
  followupWorkStatus: LeadFollowupWorkStatus;
  idempotencyKey: string;
  leadRecordId: string | null;
  workItem: LeadFollowupWorkItem | null;
};

export class LeadSourceCaptureError extends Error {
  readonly cause: unknown;
  readonly stage: 'persist_lead' | 'update_work' | 'invoke_worker';

  constructor(stage: LeadSourceCaptureError['stage'], cause: unknown) {
    const { message } = getErrorDetails(cause);
    super(message ?? stage);
    this.name = 'LeadSourceCaptureError';
    this.stage = stage;
    this.cause = cause;
  }
}

function receiptFromExistingWork(existingWork: LeadFollowupWorkItem): LeadSourceCaptureReceipt {
  const completed = existingWork.status === 'completed';
  const failed = existingWork.status === 'error';
  return {
    status: completed ? 'worker_completed' : failed ? 'worker_failed' : 'already_accepted',
    followupWorkId: existingWork.followup_work_id,
    followupWorkStatus: existingWork.status,
    idempotencyKey: existingWork.idempotency_key,
    leadRecordId: existingWork.lead_record_id,
    workItem: existingWork,
  };
}

export function shouldRepairLeadSourceWork(workItem: LeadFollowupWorkItem): boolean {
  return (
    workItem.status === 'queued' &&
    !workItem.lease_id &&
    typeof workItem.lock_expires_at !== 'number' &&
    (!workItem.journey_id || !workItem.lead_record_id)
  );
}

async function markWorkError(args: {
  error: unknown;
  nowEpochSeconds: () => number;
  repos: LeadPlatformRepos;
  workItem: LeadFollowupWorkItem;
}): Promise<void> {
  const { message } = getErrorDetails(args.error);
  await args.repos.followupWork.put({
    ...args.workItem,
    status: 'error',
    lock_expires_at: undefined,
    lead_notification_error: message ?? 'Lead capture failed',
    updated_at: args.nowEpochSeconds(),
  });
}

async function tryMarkWorkError(args: {
  error: unknown;
  nowEpochSeconds: () => number;
  repos: LeadPlatformRepos;
  workItem: LeadFollowupWorkItem;
}): Promise<void> {
  try {
    await markWorkError(args);
  } catch (markError: unknown) {
    console.error('Failed to mark lead capture work as error.', markError);
  }
}

async function persistAndDispatchLeadSource(args: {
  invokeFollowup: (idempotencyKey: string) => Promise<void>;
  nowEpochSeconds: () => number;
  persistLead: () => Promise<PersistedLeadContext | null>;
  repos: LeadPlatformRepos;
  workItem: LeadFollowupWorkItem;
}): Promise<LeadSourceCaptureReceipt> {
  let leadContext: PersistedLeadContext | null;
  try {
    leadContext = await args.persistLead();
  } catch (error: unknown) {
    await tryMarkWorkError({
      error,
      nowEpochSeconds: args.nowEpochSeconds,
      repos: args.repos,
      workItem: args.workItem,
    });
    throw new LeadSourceCaptureError('persist_lead', error);
  }

  const updatedWorkItem: LeadFollowupWorkItem = {
    ...args.workItem,
    contact_id: leadContext?.contactId ?? args.workItem.contact_id ?? null,
    journey_id: leadContext?.journeyId ?? args.workItem.journey_id ?? null,
    lead_record_id: leadContext?.leadRecordId ?? args.workItem.lead_record_id ?? null,
    updated_at: args.nowEpochSeconds(),
  };

  try {
    await args.repos.followupWork.put(updatedWorkItem);
  } catch (error: unknown) {
    await tryMarkWorkError({
      error,
      nowEpochSeconds: args.nowEpochSeconds,
      repos: args.repos,
      workItem: updatedWorkItem,
    });
    throw new LeadSourceCaptureError('update_work', error);
  }

  try {
    await args.invokeFollowup(updatedWorkItem.idempotency_key);
  } catch (error: unknown) {
    await tryMarkWorkError({
      error,
      nowEpochSeconds: args.nowEpochSeconds,
      repos: args.repos,
      workItem: updatedWorkItem,
    });
    throw new LeadSourceCaptureError('invoke_worker', error);
  }

  return {
    status: 'accepted',
    followupWorkId: updatedWorkItem.followup_work_id,
    followupWorkStatus: updatedWorkItem.status,
    idempotencyKey: updatedWorkItem.idempotency_key,
    leadRecordId: updatedWorkItem.lead_record_id,
    workItem: updatedWorkItem,
  };
}

export async function captureLeadSource(args: {
  invokeFollowup: (idempotencyKey: string) => Promise<void>;
  nowEpochSeconds: () => number;
  persistLead: () => Promise<PersistedLeadContext | null>;
  repos: LeadPlatformRepos;
  workItem: LeadFollowupWorkItem;
}): Promise<LeadSourceCaptureReceipt> {
  const reserved = await args.repos.followupWork.putIfAbsent(args.workItem);
  if (!reserved) {
    const existingWork = await args.repos.followupWork.getByIdempotencyKey(
      args.workItem.idempotency_key,
    );
    if (existingWork) {
      if (shouldRepairLeadSourceWork(existingWork)) {
        return persistAndDispatchLeadSource({
          invokeFollowup: args.invokeFollowup,
          nowEpochSeconds: args.nowEpochSeconds,
          persistLead: args.persistLead,
          repos: args.repos,
          workItem: existingWork,
        });
      }
      return receiptFromExistingWork(existingWork);
    }
    return {
      status: 'already_accepted',
      followupWorkId: args.workItem.followup_work_id,
      followupWorkStatus: args.workItem.status,
      idempotencyKey: args.workItem.idempotency_key,
      leadRecordId: args.workItem.lead_record_id,
      workItem: null,
    };
  }

  return persistAndDispatchLeadSource(args);
}
