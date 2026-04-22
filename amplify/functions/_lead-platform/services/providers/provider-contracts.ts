export type LeadProviderKey = 'quo' | 'ses';

export type LeadProviderCapability = 'sms_delivery' | 'email_delivery' | 'destination_sync';

export type ProviderReadinessIssueCode =
  | 'provider_disabled'
  | 'missing_client'
  | 'missing_api_key'
  | 'missing_sender_id'
  | 'invalid_sender_id'
  | 'invalid_user_id'
  | 'missing_contact_source'
  | 'missing_external_id_prefix'
  | 'missing_lead_tags_config'
  | 'missing_sender_email'
  | 'missing_recipient_email'
  | 'missing_reply_to_email'
  | 'missing_bcc_email';

export type ProviderReadinessIssue = {
  code: ProviderReadinessIssueCode;
  message: string;
};

export type ProviderReadiness = {
  provider: LeadProviderKey;
  capability: LeadProviderCapability;
  enabled: boolean;
  ready: boolean;
  issues: ProviderReadinessIssue[];
  message: string;
};

export type SmsDeliveryResult = {
  id: string;
  status: string | null;
};

export type SmsMessagingProvider = {
  provider: LeadProviderKey;
  capability: 'sms_delivery';
  readiness: ProviderReadiness;
  sendText(args: { body: string; toE164: string }): Promise<SmsDeliveryResult>;
};

export type EmailDeliveryAttachment = {
  content: Buffer;
  contentId?: string;
  contentType: string;
  filename: string;
  inline?: boolean;
};

export type EmailDeliveryResult = {
  messageId: string;
};

export type EmailDeliveryRequiredFields = {
  bcc?: boolean;
  replyTo?: boolean;
};

export type EmailDeliveryInput = {
  attachments?: EmailDeliveryAttachment[];
  bcc?: string[];
  from: string;
  headers?: Record<string, string | null | undefined>;
  html: string;
  replyTo?: string | null;
  required?: EmailDeliveryRequiredFields;
  subject: string;
  text: string;
  to: string[];
};

export type EmailMessagingProvider = {
  provider: LeadProviderKey;
  capability: 'email_delivery';
  readiness: ProviderReadiness;
  sendEmail(args: EmailDeliveryInput): Promise<EmailDeliveryResult>;
};

export type MessagingProvider = SmsMessagingProvider | EmailMessagingProvider;

export type DestinationSyncProvider = {
  provider: LeadProviderKey;
  capability: 'destination_sync';
  readiness: ProviderReadiness;
};
