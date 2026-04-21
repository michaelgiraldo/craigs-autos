import type { LeadFollowupWorkItem } from '../domain/lead-followup-work.ts';

export interface LeadFollowupWorkRepo {
  getById(followupWorkId: string): Promise<LeadFollowupWorkItem | null>;
  getByIdempotencyKey(idempotencyKey: string): Promise<LeadFollowupWorkItem | null>;
  acquireLease(args: {
    followupWorkId: string;
    leaseId: string;
    nowEpoch: number;
    leaseExpiresAt: number;
  }): Promise<boolean>;
  put(item: LeadFollowupWorkItem): Promise<void>;
  putIfAbsent(item: LeadFollowupWorkItem): Promise<boolean>;
}
