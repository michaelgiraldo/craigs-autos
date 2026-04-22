import type {
  LeadFollowupDrafts,
  LeadFollowupWorkItem,
} from '../_lead-platform/domain/lead-followup-work.ts';

export type LeadFollowupWorkerEvent = {
  idempotency_key?: string | null;
};

export type LambdaResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export type LeadFollowupDraftGeneration = {
  aiError: string;
  aiModel: string;
  aiStatus: 'generated' | 'fallback';
  drafts: LeadFollowupDrafts;
};

export type LeasedLeadFollowupWorkItem = LeadFollowupWorkItem & {
  lease_id: string;
};

export type LeadFollowupWorkerDeps = {
  configValid: boolean;
  smsAutomationEnabled: boolean;
  createLeaseId?: () => string;
  nowEpochSeconds: () => number;
  getFollowupWork: (idempotencyKey: string) => Promise<LeadFollowupWorkItem | null>;
  acquireLease: (args: {
    idempotencyKey: string;
    leaseId: string;
    nowEpoch: number;
    leaseExpiresAt: number;
  }) => Promise<boolean>;
  saveFollowupWork: (record: LeasedLeadFollowupWorkItem) => Promise<void>;
  generateDrafts: (record: LeadFollowupWorkItem) => Promise<LeadFollowupDraftGeneration>;
  sendSms: (args: {
    toE164: string;
    body: string;
  }) => Promise<{ id: string; status: string | null }>;
  sendCustomerEmail: (args: {
    record: LeadFollowupWorkItem;
    to: string;
    subject: string;
    body: string;
  }) => Promise<{ messageId: string }>;
  sendLeadNotificationEmail: (args: {
    record: LeadFollowupWorkItem;
  }) => Promise<{ messageId: string }>;
  cleanupInboundEmailSource?: (record: LeadFollowupWorkItem) => Promise<void>;
  cleanupLeadAttachments?: (record: LeadFollowupWorkItem) => Promise<void>;
  syncLeadRecord?: (record: LeadFollowupWorkItem) => Promise<void>;
};

export type LeadFollowupWorkflowOutcome = {
  body: Record<string, unknown>;
  statusCode: number;
};
