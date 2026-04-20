import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import PostalMime, { type Attachment } from 'postal-mime';
import type { OutgoingEmailAttachment } from '../_shared/outgoing-email.ts';
import type { QuoteRequestRecord } from '../_lead-platform/domain/quote-request.ts';

const ACCEPTED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_OWNER_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_OWNER_ATTACHMENTS = 6;

function bufferFromAttachmentContent(content: Attachment['content']): Buffer {
  if (typeof content === 'string') return Buffer.from(content, 'base64');
  if (content instanceof ArrayBuffer) return Buffer.from(new Uint8Array(content));
  return Buffer.from(content);
}

function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

export function createInboundEmailPhotoAttachmentLoader(args: {
  s3: S3Client | null;
}): (record: QuoteRequestRecord) => Promise<OutgoingEmailAttachment[]> {
  return async (record) => {
    if (!args.s3 || !record.inbound_email_s3_bucket || !record.inbound_email_s3_key) {
      return [];
    }

    const result = await args.s3.send(
      new GetObjectCommand({
        Bucket: record.inbound_email_s3_bucket,
        Key: record.inbound_email_s3_key,
      }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) return [];

    const parsed = await PostalMime.parse(Buffer.from(bytes), {
      attachmentEncoding: 'arraybuffer',
    });
    const attachments: OutgoingEmailAttachment[] = [];
    let totalBytes = 0;

    for (const attachment of parsed.attachments) {
      const mimeType = attachment.mimeType.toLowerCase();
      if (!ACCEPTED_PHOTO_TYPES.has(mimeType)) continue;
      const content = bufferFromAttachmentContent(attachment.content);
      if (!content.length || content.length > MAX_OWNER_ATTACHMENT_BYTES) continue;
      if (totalBytes + content.length > MAX_OWNER_ATTACHMENT_BYTES) break;
      const index = attachments.length + 1;
      attachments.push({
        content,
        contentType: mimeType,
        filename:
          attachment.filename?.trim() ||
          `inbound-photo-${index}.${extensionForMime(attachment.mimeType.toLowerCase())}`,
      });
      totalBytes += content.length;
      if (attachments.length >= MAX_OWNER_ATTACHMENTS) break;
    }

    return attachments;
  };
}
