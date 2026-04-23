import type {
  LeadFollowupFailureAlertKind,
  LeadFollowupFailureAlertStatus,
  LeadFollowupWorkItem,
  LeadFollowupWorkStatus,
} from '../domain/lead-followup-work.ts';

export interface LeadFollowupWorkRepo {
  getByIdempotencyKey(idempotencyKey: string): Promise<LeadFollowupWorkItem | null>;
  listByStatus(
    status: LeadFollowupWorkStatus,
    options?: {
      limit?: number;
      scanIndexForward?: boolean;
      updatedAtLte?: number;
    },
  ): Promise<LeadFollowupWorkItem[]>;
  acquireLease(args: {
    idempotencyKey: string;
    leaseId: string;
    nowEpoch: number;
    leaseExpiresAt: number;
  }): Promise<boolean>;
  updateFailureAlertState(args: {
    alertError?: string | null;
    alertKind: Exclude<LeadFollowupFailureAlertKind, null>;
    alertMessageId?: string | null;
    alertSentAt?: number;
    alertStatus: Exclude<LeadFollowupFailureAlertStatus, null>;
    expectedStatus: LeadFollowupWorkStatus;
    expectedUpdatedAt: number;
    idempotencyKey: string;
    lastAttemptAt: number;
  }): Promise<boolean>;
  put(item: LeadFollowupWorkItem): Promise<void>;
  putIfAbsent(item: LeadFollowupWorkItem): Promise<boolean>;
}
