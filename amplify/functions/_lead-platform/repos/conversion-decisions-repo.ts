import type { LeadConversionDecision } from '../domain/conversion-feedback.ts';

export interface LeadConversionDecisionsRepo {
  getById(decisionId: string): Promise<LeadConversionDecision | null>;
  listByLeadRecordId(leadRecordId: string): Promise<LeadConversionDecision[]>;
  put(decision: LeadConversionDecision): Promise<void>;
}
