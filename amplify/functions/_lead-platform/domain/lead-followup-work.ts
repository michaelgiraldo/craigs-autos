import type { AttributionSnapshot } from './attribution.ts';
import type { LeadAttachment } from './lead-attachment.ts';
import type { CaptureChannel } from './lead-actions.ts';
import {
  createFallbackLeadSummary,
  type CustomerResponsePolicy,
  type LeadSummary,
} from './lead-summary.ts';

export const LEAD_FOLLOWUP_WORK_TTL_DAYS = 180;

export type LeadFollowupWorkStatus = 'queued' | 'processing' | 'completed' | 'error';
export type LeadFollowupAiStatus = 'generated' | 'fallback' | null;
export type LeadFollowupSendStatus = 'sending' | 'sent' | 'failed' | 'skipped' | null;
export type LeadFollowupOutreachChannel = 'sms' | 'email' | null;
export type LeadFollowupPreferredOutreachChannel = 'sms' | 'email' | null;
export type LeadFollowupFailureAlertStatus = 'sent' | 'failed' | null;
export type LeadFollowupFailureAlertKind = 'error' | 'stale_queued' | 'stale_processing' | null;
export type LeadFollowupOutreachResult =
  | 'sms_sent'
  | 'email_sent'
  | 'email_sent_fallback'
  | 'manual_followup_required'
  | 'no_customer_contact_method'
  | 'sms_failed_no_email_fallback'
  | 'customer_outreach_failed'
  | null;

export type LeadFollowupDrafts = {
  smsBody: string;
  emailSubject: string;
  emailBody: string;
  missingInfo: string[];
};

export type LeadFollowupWorkItem = {
  followup_work_id: string;
  idempotency_key: string;
  source_event_id: string;
  status: LeadFollowupWorkStatus;
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
  customer_language: string;
  capture_channel: CaptureChannel;
  lead_summary?: LeadSummary;
  customer_response_policy?: CustomerResponsePolicy;
  customer_response_policy_reason?: string;
  preferred_outreach_channel?: LeadFollowupPreferredOutreachChannel;
  origin: string;
  site_label: string;
  journey_id: string | null;
  lead_record_id: string | null;
  contact_id: string | null;
  locale: string;
  page_url: string;
  user_id: string;
  attribution: AttributionSnapshot | null;
  ai_status: LeadFollowupAiStatus;
  ai_model: string;
  ai_error: string;
  sms_body: string;
  email_subject: string;
  email_body: string;
  missing_info: string[];
  sms_status: LeadFollowupSendStatus;
  sms_message_id: string;
  sms_error: string;
  email_status: LeadFollowupSendStatus;
  customer_email_message_id: string;
  customer_email_error: string;
  outreach_channel: LeadFollowupOutreachChannel;
  outreach_result: LeadFollowupOutreachResult;
  lead_notification_status: LeadFollowupSendStatus;
  lead_notification_message_id: string;
  lead_notification_error: string;
  failure_alert_status?: LeadFollowupFailureAlertStatus;
  failure_alert_kind?: LeadFollowupFailureAlertKind;
  failure_alert_sent_at?: number;
  failure_alert_last_attempt_at?: number;
  failure_alert_message_id?: string;
  failure_alert_error?: string;
  operator_resolution?: 'manual_followup';
  operator_resolution_reason?: string;
  operator_resolved_at?: number;
  source_message_id?: string;
  source_references?: string;
  attachments?: LeadAttachment[];
  attachment_count?: number;
  photo_attachment_count?: number;
  email_thread_key?: string;
  inbound_email_subject?: string;
  inbound_email_s3_bucket?: string;
  inbound_email_s3_key?: string;
  inbound_attachment_count?: number;
  inbound_photo_attachment_count?: number;
  unsupported_attachment_count?: number;
  inbound_route_status?: string;
  chat_thread_id?: string;
  chat_thread_title?: string;
};

export type LeadFollowupWorkItemInput = {
  attribution: AttributionSnapshot | null;
  captureChannel: CaptureChannel;
  contactId?: string | null;
  email: string | null | undefined;
  followupWorkId: string;
  idempotencyKey?: string | null;
  sourceEventId?: string | null;
  emailThreadKey?: string;
  journeyId?: string | null;
  leadRecordId?: string | null;
  locale: string | null | undefined;
  message: string | null | undefined;
  customerLanguage?: string | null;
  leadSummary?: LeadSummary | null;
  customerResponsePolicy?: CustomerResponsePolicy | null;
  customerResponsePolicyReason?: string | null;
  name: string | null | undefined;
  nowEpochSeconds: number;
  origin: string | null | undefined;
  pageUrl: string | null | undefined;
  phone: string | null | undefined;
  preferredOutreachChannel?: LeadFollowupPreferredOutreachChannel;
  service: string | null | undefined;
  siteLabel: string | null | undefined;
  sourceMessageId?: string;
  sourceReferences?: string;
  attachments?: LeadAttachment[];
  attachmentCount?: number;
  photoAttachmentCount?: number;
  inboundEmailSubject?: string;
  inboundEmailS3Bucket?: string;
  inboundEmailS3Key?: string;
  inboundAttachmentCount?: number;
  inboundPhotoAttachmentCount?: number;
  unsupportedAttachmentCount?: number;
  inboundRouteStatus?: string;
  chatThreadId?: string;
  chatThreadTitle?: string | null;
  ttlDays?: number;
  userId: string | null | undefined;
  vehicle: string | null | undefined;
};

export function normalizeWorkString(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function createLeadFollowupWorkItem(input: LeadFollowupWorkItemInput): LeadFollowupWorkItem {
  const ttlDays = input.ttlDays ?? LEAD_FOLLOWUP_WORK_TTL_DAYS;
  const sourceEventId = normalizeWorkString(input.sourceEventId) || input.followupWorkId;
  const leadSummary =
    input.leadSummary ??
    createFallbackLeadSummary({
      captureChannel: input.captureChannel,
      customerEmail: input.email,
      customerLanguage: input.customerLanguage ?? input.locale,
      customerMessage: input.message,
      customerName: input.name,
      customerPhone: input.phone,
      vehicle: input.vehicle,
      service: input.service,
      missingInfo: [],
      photoReferenceCount:
        input.photoAttachmentCount ??
        input.inboundPhotoAttachmentCount ??
        input.attachments?.length ??
        0,
      loadedPhotoCount: 0,
      unsupportedAttachmentCount: input.unsupportedAttachmentCount,
      customerResponsePolicy: input.customerResponsePolicy,
      customerResponsePolicyReason: input.customerResponsePolicyReason,
    });
  const customerResponsePolicy =
    input.customerResponsePolicy ?? leadSummary.customer_response_policy;

  return {
    followup_work_id: input.followupWorkId,
    idempotency_key:
      normalizeWorkString(input.idempotencyKey) || `${input.captureChannel}:${sourceEventId}`,
    source_event_id: sourceEventId,
    status: 'queued',
    created_at: input.nowEpochSeconds,
    updated_at: input.nowEpochSeconds,
    ttl: input.nowEpochSeconds + ttlDays * 24 * 60 * 60,
    name: normalizeWorkString(input.name),
    email: normalizeWorkString(input.email),
    phone: normalizeWorkString(input.phone),
    vehicle: normalizeWorkString(input.vehicle),
    service: normalizeWorkString(input.service),
    message: normalizeWorkString(input.message),
    customer_language:
      normalizeWorkString(input.customerLanguage) ||
      normalizeWorkString(leadSummary.customer_language),
    capture_channel: input.captureChannel,
    lead_summary: leadSummary,
    customer_response_policy: customerResponsePolicy,
    customer_response_policy_reason:
      normalizeWorkString(input.customerResponsePolicyReason) ||
      leadSummary.customer_response_policy_reason,
    preferred_outreach_channel: input.preferredOutreachChannel ?? null,
    origin: normalizeWorkString(input.origin),
    site_label: normalizeWorkString(input.siteLabel),
    journey_id: input.journeyId ?? null,
    lead_record_id: input.leadRecordId ?? null,
    contact_id: input.contactId ?? null,
    locale: normalizeWorkString(input.locale),
    page_url: normalizeWorkString(input.pageUrl),
    user_id: normalizeWorkString(input.userId),
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
    lead_notification_status: null,
    lead_notification_message_id: '',
    lead_notification_error: '',
    failure_alert_status: null,
    failure_alert_kind: null,
    source_message_id: normalizeWorkString(input.sourceMessageId),
    source_references: normalizeWorkString(input.sourceReferences),
    attachments: input.attachments ?? [],
    attachment_count: input.attachmentCount ?? input.attachments?.length ?? 0,
    photo_attachment_count: input.photoAttachmentCount ?? input.attachments?.length ?? 0,
    email_thread_key: normalizeWorkString(input.emailThreadKey),
    inbound_email_subject: normalizeWorkString(input.inboundEmailSubject),
    inbound_email_s3_bucket: normalizeWorkString(input.inboundEmailS3Bucket),
    inbound_email_s3_key: normalizeWorkString(input.inboundEmailS3Key),
    inbound_attachment_count: input.inboundAttachmentCount ?? 0,
    inbound_photo_attachment_count: input.inboundPhotoAttachmentCount ?? 0,
    unsupported_attachment_count: input.unsupportedAttachmentCount ?? 0,
    inbound_route_status: normalizeWorkString(input.inboundRouteStatus),
    chat_thread_id: normalizeWorkString(input.chatThreadId),
    chat_thread_title: normalizeWorkString(input.chatThreadTitle),
  };
}
