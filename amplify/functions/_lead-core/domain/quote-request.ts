import type { AttributionSnapshot } from './attribution.ts';

export const QUOTE_REQUEST_TTL_DAYS = 180;

export type QuoteSubmissionStatus = 'queued' | 'processing' | 'completed' | 'error';

export type QuoteAiStatus = 'generated' | 'fallback' | null;
export type QuoteSendStatus = 'sent' | 'failed' | 'skipped' | null;
export type QuoteOutreachChannel = 'sms' | 'email' | null;
export type QuoteOutreachResult =
  | 'sms_sent'
  | 'email_sent_fallback'
  | 'manual_followup_required'
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

export type QuoteLeadLink = {
  journeyId: string | null;
  leadRecordId: string | null;
  contactId: string | null;
};

export type QuoteSubmissionRecordInput = {
  attribution: AttributionSnapshot | null;
  contactId?: string | null;
  email: string;
  journeyId?: string | null;
  leadRecordId?: string | null;
  locale: string;
  message: string;
  name: string;
  nowEpochSeconds: number;
  origin: string;
  pageUrl: string;
  phone: string;
  service: string;
  siteLabel: string;
  submissionId: string;
  ttlDays?: number;
  userId: string;
  vehicle: string;
};

export function normalizeString(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function createQuoteSubmissionRecord(
  input: QuoteSubmissionRecordInput,
): QuoteSubmissionRecord {
  const ttlDays = input.ttlDays ?? QUOTE_REQUEST_TTL_DAYS;

  return {
    submission_id: input.submissionId,
    status: 'queued',
    created_at: input.nowEpochSeconds,
    updated_at: input.nowEpochSeconds,
    ttl: input.nowEpochSeconds + ttlDays * 24 * 60 * 60,
    name: input.name,
    email: input.email,
    phone: input.phone,
    vehicle: input.vehicle,
    service: input.service,
    message: input.message,
    origin: input.origin,
    site_label: input.siteLabel,
    journey_id: input.journeyId ?? null,
    lead_record_id: input.leadRecordId ?? null,
    contact_id: input.contactId ?? null,
    locale: input.locale,
    page_url: input.pageUrl,
    user_id: input.userId,
    attribution: input.attribution,
    ai_status: null,
    ai_model: '',
    ai_error: '',
    sms_body: '',
    email_subject: '',
    email_body: '',
    missing_info: [],
    sms_status: null,
    sms_message_id: '',
    sms_error: '',
    email_status: null,
    customer_email_message_id: '',
    customer_email_error: '',
    outreach_channel: null,
    outreach_result: null,
    owner_email_status: null,
    owner_email_message_id: '',
    owner_email_error: '',
  };
}
