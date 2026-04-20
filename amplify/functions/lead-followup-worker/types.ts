import type { QuoteDrafts, QuoteRequestRecord } from '../_lead-platform/domain/quote-request.ts';

export type LeadFollowupWorkerEvent = {
  quote_request_id?: string | null;
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

export type LeadFollowupWorkerDeps = {
  configValid: boolean;
  smsAutomationEnabled: boolean;
  createLeaseId?: () => string;
  nowEpochSeconds: () => number;
  getQuoteRequest: (quoteRequestId: string) => Promise<QuoteRequestRecord | null>;
  acquireLease: (args: {
    quoteRequestId: string;
    leaseId: string;
    nowEpoch: number;
    leaseExpiresAt: number;
  }) => Promise<boolean>;
  saveQuoteRequest: (record: QuoteRequestRecord) => Promise<void>;
  generateDrafts: (record: QuoteRequestRecord) => Promise<QuoteDraftGeneration>;
  sendSms: (args: {
    toE164: string;
    body: string;
  }) => Promise<{ id: string; status: string | null }>;
  sendCustomerEmail: (args: {
    record: QuoteRequestRecord;
    to: string;
    subject: string;
    body: string;
  }) => Promise<{ messageId: string }>;
  sendOwnerEmail: (args: { record: QuoteRequestRecord }) => Promise<{ messageId: string }>;
  cleanupInboundEmailSource?: (record: QuoteRequestRecord) => Promise<void>;
  syncLeadRecord?: (record: QuoteRequestRecord) => Promise<void>;
};

export type QuoteWorkflowOutcome = {
  body: Record<string, unknown>;
  statusCode: number;
};
