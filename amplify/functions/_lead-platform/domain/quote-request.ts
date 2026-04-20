import type { AttributionSnapshot } from './attribution.ts';

export const QUOTE_REQUEST_TTL_DAYS = 180;

export type QuoteRequestStatus = 'queued' | 'processing' | 'completed' | 'error';

export type QuoteAiStatus = 'generated' | 'fallback' | null;
export type QuoteSendStatus = 'sent' | 'failed' | 'skipped' | null;
export type QuoteCaptureChannel = 'form' | 'email';
export type QuoteOutreachChannel = 'sms' | 'email' | null;
export type QuotePreferredOutreachChannel = 'sms' | 'email' | null;
export type QuoteOutreachResult =
  | 'sms_sent'
  | 'email_sent'
  | 'email_sent_fallback'
  | 'manual_followup_required'
  | 'no_customer_contact_method'
  | 'sms_failed_no_email_fallback'
  | 'customer_outreach_failed'
  | null;

export type QuoteRequestRecord = {
  quote_request_id: string;
  status: QuoteRequestStatus;
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
  capture_channel?: QuoteCaptureChannel;
  preferred_outreach_channel?: QuotePreferredOutreachChannel;
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
  source_message_id?: string;
  source_references?: string;
  email_thread_key?: string;
  inbound_email_subject?: string;
  inbound_email_s3_bucket?: string;
  inbound_email_s3_key?: string;
  inbound_attachment_count?: number;
  inbound_photo_attachment_count?: number;
  unsupported_attachment_count?: number;
  inbound_route_status?: string;
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

export type QuoteRequestRecordInput = {
  attribution: AttributionSnapshot | null;
  contactId?: string | null;
  captureChannel?: QuoteCaptureChannel;
  email: string;
  emailThreadKey?: string;
  journeyId?: string | null;
  leadRecordId?: string | null;
  locale: string;
  message: string;
  name: string;
  nowEpochSeconds: number;
  origin: string;
  pageUrl: string;
  phone: string;
  preferredOutreachChannel?: QuotePreferredOutreachChannel;
  service: string;
  siteLabel: string;
  sourceMessageId?: string;
  sourceReferences?: string;
  inboundEmailSubject?: string;
  inboundEmailS3Bucket?: string;
  inboundEmailS3Key?: string;
  inboundAttachmentCount?: number;
  inboundPhotoAttachmentCount?: number;
  unsupportedAttachmentCount?: number;
  inboundRouteStatus?: string;
  quoteRequestId: string;
  ttlDays?: number;
  userId: string;
  vehicle: string;
};

export function normalizeString(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function createQuoteRequestRecord(input: QuoteRequestRecordInput): QuoteRequestRecord {
  const ttlDays = input.ttlDays ?? QUOTE_REQUEST_TTL_DAYS;

  return {
    quote_request_id: input.quoteRequestId,
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
    capture_channel: input.captureChannel ?? 'form',
    preferred_outreach_channel: input.preferredOutreachChannel ?? null,
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
    source_message_id: normalizeString(input.sourceMessageId),
    source_references: normalizeString(input.sourceReferences),
    email_thread_key: normalizeString(input.emailThreadKey),
    inbound_email_subject: normalizeString(input.inboundEmailSubject),
    inbound_email_s3_bucket: normalizeString(input.inboundEmailS3Bucket),
    inbound_email_s3_key: normalizeString(input.inboundEmailS3Key),
    inbound_attachment_count: input.inboundAttachmentCount ?? 0,
    inbound_photo_attachment_count: input.inboundPhotoAttachmentCount ?? 0,
    unsupported_attachment_count: input.unsupportedAttachmentCount ?? 0,
    inbound_route_status: normalizeString(input.inboundRouteStatus),
  };
}
