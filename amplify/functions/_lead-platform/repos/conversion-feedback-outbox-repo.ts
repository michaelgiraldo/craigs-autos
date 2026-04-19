import type { ManagedConversionFeedbackStatus } from '@craigs/contracts/managed-conversion-contract';
import type { LeadConversionFeedbackOutboxItem } from '../domain/conversion-feedback.ts';

export interface LeadConversionFeedbackOutboxRepo {
  getById(outboxId: string): Promise<LeadConversionFeedbackOutboxItem | null>;
  listByDecisionId(decisionId: string): Promise<LeadConversionFeedbackOutboxItem[]>;
  listByLeadRecordId(leadRecordId: string): Promise<LeadConversionFeedbackOutboxItem[]>;
  listByStatus(
    status: ManagedConversionFeedbackStatus,
  ): Promise<LeadConversionFeedbackOutboxItem[]>;
  put(item: LeadConversionFeedbackOutboxItem): Promise<void>;
}
