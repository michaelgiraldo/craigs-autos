import type { QuoteDrafts, QuoteSubmissionRecord } from '../_lead-core/domain/quote-request.ts';

export type QuoteFollowupEvent = {
  submission_id?: string | null;
};

export type LambdaResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export type QuoteDraftGeneration = {
  aiError: string;
  aiModel: string;
  aiStatus: 'generated' | 'fallback';
  drafts: QuoteDrafts;
};

export type QuoteFollowupDeps = {
  configValid: boolean;
  smsAutomationEnabled: boolean;
  createLeaseId?: () => string;
  nowEpochSeconds: () => number;
  getSubmission: (submissionId: string) => Promise<QuoteSubmissionRecord | null>;
  acquireLease: (args: {
    submissionId: string;
    leaseId: string;
    nowEpoch: number;
    leaseExpiresAt: number;
  }) => Promise<boolean>;
  saveSubmission: (record: QuoteSubmissionRecord) => Promise<void>;
  generateDrafts: (record: QuoteSubmissionRecord) => Promise<QuoteDraftGeneration>;
  sendSms: (args: {
    toE164: string;
    body: string;
  }) => Promise<{ id: string; status: string | null }>;
  sendCustomerEmail: (args: {
    to: string;
    subject: string;
    body: string;
  }) => Promise<{ messageId: string }>;
  sendOwnerEmail: (args: { record: QuoteSubmissionRecord }) => Promise<{ messageId: string }>;
  syncLeadRecord?: (record: QuoteSubmissionRecord) => Promise<void>;
};

export type QuoteWorkflowOutcome = {
  body: Record<string, unknown>;
  statusCode: number;
};
