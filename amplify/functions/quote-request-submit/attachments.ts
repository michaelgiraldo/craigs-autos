import { HeadObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import {
  createFormLeadPhotoAttachment,
  isSupportedLeadPhotoContentType,
  sanitizeLeadAttachmentPathSegment,
  sanitizeLeadAttachmentFilename,
  LEAD_PHOTO_LIMITS,
  type LeadAttachment,
  type LeadPhotoContentType,
} from '../_lead-platform/domain/lead-attachment.ts';
import type { QuoteRequestSubmittedAttachment } from './request.ts';

export type ResolveFormAttachmentsResult = {
  attachments: LeadAttachment[];
  unsupportedAttachmentCount: number;
};

export type ResolveFormAttachments = (args: {
  attachments: QuoteRequestSubmittedAttachment[];
  clientEventId: string | null;
  unsupportedAttachmentCount: number;
}) => Promise<ResolveFormAttachmentsResult>;

function metadataValue(metadata: Record<string, string> | undefined, key: string): string {
  return metadata?.[key]?.trim() ?? '';
}

function isExpectedFormAttachmentKey(args: {
  attachment: QuoteRequestSubmittedAttachment;
  clientEventId: string;
}): boolean {
  const eventSegment = sanitizeLeadAttachmentPathSegment(args.clientEventId);
  return args.attachment.key.startsWith(`form/${eventSegment}/${args.attachment.attachmentId}/`);
}

export function createS3FormAttachmentResolver(args: {
  bucketName: string;
  s3: S3Client | null;
}): ResolveFormAttachments {
  return async ({ attachments, clientEventId, unsupportedAttachmentCount }) => {
    if (!args.s3 || !args.bucketName || !clientEventId) {
      return {
        attachments: [],
        unsupportedAttachmentCount: unsupportedAttachmentCount + attachments.length,
      };
    }

    const resolved: LeadAttachment[] = [];
    let unsupported = unsupportedAttachmentCount;
    let totalBytes = 0;

    for (const attachment of attachments) {
      if (
        resolved.length >= LEAD_PHOTO_LIMITS.maxCount ||
        !isSupportedLeadPhotoContentType(attachment.contentType) ||
        attachment.byteSize <= 0 ||
        attachment.byteSize > LEAD_PHOTO_LIMITS.maxBytesPerPhoto ||
        !isExpectedFormAttachmentKey({ attachment, clientEventId })
      ) {
        unsupported += 1;
        continue;
      }

      try {
        const result = await args.s3.send(
          new HeadObjectCommand({
            Bucket: args.bucketName,
            Key: attachment.key,
          }),
        );
        const contentType = result.ContentType?.toLowerCase() ?? '';
        const byteSize = result.ContentLength ?? 0;

        if (
          contentType !== attachment.contentType ||
          byteSize !== attachment.byteSize ||
          totalBytes + byteSize > LEAD_PHOTO_LIMITS.maxTotalBytes ||
          metadataValue(result.Metadata, 'client-event-id') !== clientEventId ||
          metadataValue(result.Metadata, 'attachment-id') !== attachment.attachmentId
        ) {
          unsupported += 1;
          continue;
        }

        resolved.push(
          createFormLeadPhotoAttachment({
            attachmentId: attachment.attachmentId,
            bucket: args.bucketName,
            byteSize,
            contentType: contentType as LeadPhotoContentType,
            filename: sanitizeLeadAttachmentFilename(attachment.filename, contentType),
            key: attachment.key,
          }),
        );
        totalBytes += byteSize;
      } catch (error: unknown) {
        console.error('Unable to validate uploaded lead attachment.', error);
        unsupported += 1;
      }
    }

    return {
      attachments: resolved,
      unsupportedAttachmentCount: unsupported,
    };
  };
}
