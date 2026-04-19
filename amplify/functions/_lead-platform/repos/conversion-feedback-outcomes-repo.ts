import type { LeadConversionFeedbackOutcome } from '../domain/conversion-feedback.ts';

export interface LeadConversionFeedbackOutcomesRepo {
  append(outcome: LeadConversionFeedbackOutcome): Promise<void>;
  listByLeadRecordId(leadRecordId: string): Promise<LeadConversionFeedbackOutcome[]>;
  listByOutboxId(outboxId: string): Promise<LeadConversionFeedbackOutcome[]>;
}
