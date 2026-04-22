import { createEmailLeadPhotoAttachments } from '../_lead-platform/domain/lead-attachment.ts';
import {
  createLeadFollowupWorkItem,
  type LeadFollowupWorkItem,
} from '../_lead-platform/domain/lead-followup-work.ts';
import { createLeadSourceEvent } from '../_lead-platform/domain/lead-source-event.ts';
import { normalizeEmailMessageId } from '../_shared/email-threading.ts';
import { normalizeWhitespace } from '../_shared/text-utils.ts';
import type { EmailIntakeDeps, ParsedInboundEmail, S3EmailSource } from './types.ts';

export function createEmailFollowupWork(args: {
  deps: EmailIntakeDeps;
  email: ParsedInboundEmail;
  evaluation: Awaited<ReturnType<EmailIntakeDeps['evaluateLead']>>;
  leadContext: {
    contactId: string | null;
    journeyId: string | null;
    leadRecordId: string | null;
  };
  followupWorkId: string;
  routeStatus: string;
  source: S3EmailSource;
  threadKey: string;
}): LeadFollowupWorkItem {
  const now = args.deps.nowEpochSeconds();
  const customerMessage = normalizeWhitespace(
    args.evaluation.projectSummary || args.email.text || args.email.subject || 'Inbound email lead',
  ).slice(0, 4_000);
  const sourceMessageId = normalizeEmailMessageId(args.email.messageId);
  const attachments = createEmailLeadPhotoAttachments({
    bucket: args.source.bucket,
    key: args.source.key,
    photos: args.email.photoAttachments.map((photo) => ({
      byteSize: photo.content.length,
      contentType: photo.contentType,
      filename: photo.filename,
    })),
  });
  const sourceEvent = createLeadSourceEvent({
    attribution: null,
    contactId: args.leadContext.contactId,
    email: args.evaluation.customerEmail ?? args.email.from?.address ?? '',
    idempotencyKey: args.threadKey,
    journeyId: args.leadContext.journeyId,
    leadRecordId: args.leadContext.leadRecordId,
    locale: 'en',
    message: customerMessage,
    metadata: {
      attachment_count: args.email.attachmentCount,
      photo_attachment_count: args.email.photoAttachments.length,
      route_status: args.routeStatus,
      unsupported_attachment_count: args.email.unsupportedAttachmentCount,
    },
    name: args.evaluation.customerName ?? args.email.from?.name ?? '',
    occurredAtMs: now * 1000,
    origin: `email:${args.deps.config.originalRecipient}`,
    pageUrl: '',
    phone: args.evaluation.customerPhone ?? '',
    service: args.evaluation.service ?? '',
    siteLabel: args.deps.config.siteLabel,
    source: 'email',
    sourceEventId: sourceMessageId || args.threadKey,
    userId: '',
    vehicle: args.evaluation.vehicle ?? '',
  });

  const record = createLeadFollowupWorkItem({
    attribution: sourceEvent.attribution,
    captureChannel: sourceEvent.source,
    contactId: sourceEvent.contact_id,
    email: sourceEvent.email,
    emailThreadKey: args.threadKey,
    attachments,
    attachmentCount: args.email.attachmentCount,
    photoAttachmentCount: attachments.length,
    inboundAttachmentCount: args.email.attachmentCount,
    inboundEmailS3Bucket: args.source.bucket,
    inboundEmailS3Key: args.source.key,
    inboundEmailSubject: args.email.subject,
    inboundPhotoAttachmentCount: args.email.photoAttachments.length,
    inboundRouteStatus: args.routeStatus,
    journeyId: sourceEvent.journey_id,
    leadRecordId: sourceEvent.lead_record_id,
    locale: sourceEvent.locale,
    message: sourceEvent.message,
    name: sourceEvent.name,
    nowEpochSeconds: now,
    origin: sourceEvent.origin,
    pageUrl: sourceEvent.page_url,
    phone: sourceEvent.phone,
    preferredOutreachChannel: 'email',
    followupWorkId: args.followupWorkId,
    idempotencyKey: sourceEvent.idempotency_key,
    sourceEventId: sourceEvent.source_event_id,
    service: sourceEvent.service,
    siteLabel: sourceEvent.site_label,
    sourceMessageId,
    sourceReferences: args.email.references,
    unsupportedAttachmentCount: args.email.unsupportedAttachmentCount,
    userId: sourceEvent.user_id,
    vehicle: sourceEvent.vehicle,
  });

  record.missing_info = args.evaluation.missingInfo;
  return record;
}
