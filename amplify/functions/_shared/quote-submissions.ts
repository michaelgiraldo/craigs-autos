import type { AttributionSnapshot } from '../_lead-core/domain/types.ts';

export type QuoteSubmissionStatus = 'queued' | 'processing' | 'completed' | 'error';

export type QuoteAiStatus = 'generated' | 'fallback' | null;
export type QuoteSendStatus = 'sent' | 'failed' | 'skipped' | null;
export type QuoteOutreachChannel = 'sms' | 'email' | null;
export type QuoteOutreachResult =
  | 'sms_sent'
  | 'email_sent_fallback'
  | 'no_customer_contact_method'
  | 'sms_failed_no_email_fallback'
  | 'customer_outreach_failed'
  | null;

export type QuoteSubmissionRecord = {
  submission_id: string;
  status: QuoteSubmissionStatus;
  lease_id?: string;
  lock_expires_at?: number;
  created_at: number;
  updated_at: number;
  ttl: number;
  name: string;
  email: string;
  phone: string;
  vehicle: string;
  service: string;
  message: string;
  origin: string;
  site_label: string;
  journey_id: string | null;
  lead_record_id: string | null;
  contact_id: string | null;
  locale: string;
  page_url: string;
  user_id: string;
  attribution: AttributionSnapshot | null;
  ai_status: QuoteAiStatus;
  ai_model: string;
  ai_error: string;
  sms_body: string;
  email_subject: string;
  email_body: string;
  missing_info: string[];
  sms_status: QuoteSendStatus;
  sms_message_id: string;
  sms_error: string;
  email_status: QuoteSendStatus;
  customer_email_message_id: string;
  customer_email_error: string;
  outreach_channel: QuoteOutreachChannel;
  outreach_result: QuoteOutreachResult;
  owner_email_status: QuoteSendStatus;
  owner_email_message_id: string;
  owner_email_error: string;
};

export type QuoteDrafts = {
  smsBody: string;
  emailSubject: string;
  emailBody: string;
  missingInfo: string[];
};

export type QuoteSubmissionInput = {
  name: string;
  email: string;
  phone: string;
  vehicle: string;
  service: string;
  message: string;
  origin: string;
  siteLabel: string;
};

export function normalizeString(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}
