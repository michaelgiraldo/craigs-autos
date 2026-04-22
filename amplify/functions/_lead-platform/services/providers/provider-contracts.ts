export type LeadProviderKey = 'quo' | 'ses';

export type LeadProviderCapability = 'sms_delivery' | 'email_delivery' | 'destination_sync';

export type ProviderReadinessIssueCode =
  | 'provider_disabled'
  | 'missing_api_key'
  | 'missing_sender_id'
  | 'invalid_sender_id'
  | 'invalid_user_id'
  | 'missing_contact_source'
  | 'missing_external_id_prefix'
  | 'missing_lead_tags_config';

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

export type MessagingProvider = {
  provider: LeadProviderKey;
  capability: 'sms_delivery';
  readiness: ProviderReadiness;
  sendText(args: { body: string; toE164: string }): Promise<SmsDeliveryResult>;
};

export type DestinationSyncProvider = {
  provider: LeadProviderKey;
  capability: 'destination_sync';
  readiness: ProviderReadiness;
};
