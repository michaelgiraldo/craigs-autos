import type { QuoteRequestRecord } from '../_lead-platform/domain/quote-request.ts';

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
  allowDirectIntake: boolean;
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
  emailBody: string;
  emailSubject: string;
  isLead: boolean;
  leadReason: string;
  missingInfo: string[];
  projectSummary: string | null;
  service: string | null;
  smsBody: string;
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
  createQuoteRequestId: () => string;
  deleteRawEmail: (source: S3EmailSource) => Promise<void>;
  evaluateLead: (args: {
    email: ParsedInboundEmail;
    photos: ParsedPhotoAttachment[];
  }) => Promise<EmailLeadEvaluation>;
  getRawEmail: (source: S3EmailSource) => Promise<Buffer>;
  invokeFollowup: (quoteRequestId: string) => Promise<void>;
  ledger: EmailIntakeLedger;
  nowEpochSeconds: () => number;
  persistEmailLead: (args: PersistEmailLeadInput) => Promise<PersistedEmailLead | null>;
  queueQuoteRequest: (record: QuoteRequestRecord) => Promise<void>;
};

export type ParsedAddress = {
  address: string;
  name: string;
};

export type ParsedPhotoAttachment = {
  content: Buffer;
  contentType: string;
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
  customerPhone: string | null;
  emailIntakeId: string;
  messageId: string;
  missingInfo: string[];
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
