import type { LeadPlatformRepos } from '../_lead-platform/repos/dynamo.ts';
import type { LeadPhotoContentType } from '../_lead-platform/domain/lead-attachment.ts';
import type {
  CustomerResponsePolicy,
  LeadSummary,
  LeadTriageDecision,
} from '../_lead-platform/domain/lead-summary.ts';

export type S3EmailIntakeEvent = {
  Records?: Array<{
    s3?: {
      bucket?: { name?: string | null } | null;
      object?: { key?: string | null } | null;
    } | null;
  }>;
};

export type S3EmailSource = {
  bucket: string;
  key: string;
};

export type EmailIntakeConfig = {
  googleRouteHeaderValue: string;
  intakeRecipient: string;
  model: string;
  originalRecipient: string;
  shopAddress: string;
  shopName: string;
  shopPhoneDisplay: string;
  siteLabel: string;
};

export type EmailIntakeLedgerStatus = 'processing' | 'queued' | 'rejected' | 'skipped' | 'error';

export type EmailIntakeLedger = {
  markStatus: (args: {
    key: string;
    reason?: string;
    status: EmailIntakeLedgerStatus;
  }) => Promise<void>;
  reserve: (args: { item: Record<string, unknown>; key: string; ttl: number }) => Promise<boolean>;
};

export type EmailLeadEvaluation = {
  aiError: string;
  customerEmail: string | null;
  customerLanguage: string | null;
  customerName: string | null;
  customerPhone: string | null;
  isLead: boolean;
  leadReason: string;
  triageDecision: LeadTriageDecision;
  customerResponsePolicy: CustomerResponsePolicy;
  customerResponsePolicyReason: string;
  leadSummary: LeadSummary;
  missingInfo: string[];
  projectSummary: string | null;
  service: string | null;
  vehicle: string | null;
};

export type PersistedEmailLead = {
  contactId: string | null;
  journeyId: string;
  leadRecordId: string | null;
};

export type EmailIntakeDeps = {
  config: EmailIntakeConfig;
  configValid: boolean;
  deleteRawEmail: (source: S3EmailSource) => Promise<void>;
  evaluateLead: (args: {
    email: ParsedInboundEmail;
    photos: ParsedPhotoAttachment[];
  }) => Promise<EmailLeadEvaluation>;
  getRawEmail: (source: S3EmailSource) => Promise<Buffer>;
  invokeFollowup: (idempotencyKey: string) => Promise<void>;
  ledger: EmailIntakeLedger;
  nowEpochSeconds: () => number;
  persistEmailLead: (args: PersistEmailLeadInput) => Promise<PersistedEmailLead | null>;
  repos: LeadPlatformRepos | null;
};

export type ParsedAddress = {
  address: string;
  name: string;
};

export type ParsedPhotoAttachment = {
  content: Buffer;
  contentType: LeadPhotoContentType;
  filename: string;
};

export type ParsedInboundEmail = {
  attachmentCount: number;
  cc: ParsedAddress[];
  date: string;
  from: ParsedAddress | null;
  header: (name: string) => string;
  inReplyTo: string;
  messageId: string;
  photoAttachments: ParsedPhotoAttachment[];
  references: string;
  subject: string;
  text: string;
  to: ParsedAddress[];
  unsupportedAttachmentCount: number;
};

export type PersistEmailLeadInput = {
  customerEmail: string;
  customerLanguage: string | null;
  customerMessage: string;
  customerName: string | null;
  customerNameConfidence: 'high' | 'medium' | 'low';
  customerNameSourceMethod: 'ai_extracted' | 'email_header';
  customerPhone: string | null;
  emailIntakeId: string;
  messageId: string;
  missingInfo: string[];
  leadSummary: LeadSummary;
  originalRecipient: string;
  photoAttachmentCount: number;
  projectSummary: string | null;
  routeStatus: string;
  service: string | null;
  subject: string;
  threadKey: string;
  unsupportedAttachmentCount: number;
  vehicle: string | null;
};
