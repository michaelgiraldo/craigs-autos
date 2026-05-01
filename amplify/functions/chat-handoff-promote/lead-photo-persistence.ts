import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import {
  LEAD_PHOTO_LIMITS,
  isSupportedLeadPhotoContentType,
  sanitizeLeadAttachmentFilename,
  sanitizeLeadAttachmentPathSegment,
  type LeadAttachment,
} from '../_lead-platform/domain/lead-attachment.ts';

type FetchFile = typeof fetch;

export type PersistChatLeadPhotoAttachmentsArgs = {
  attachments: LeadAttachment[];
  bucketName: string;
  fetchFile?: FetchFile;
  s3: S3Client | null;
  threadId: string;
};

type DownloadedChatPhoto = {
  content: Buffer;
  contentType: string;
  filename: string;
};

function headerValue(headers: Headers, name: string): string {
  return headers.get(name)?.split(';')[0]?.trim().toLowerCase() ?? '';
}

async function downloadChatPhoto(args: {
  attachment: LeadAttachment;
  fetchFile: FetchFile;
}): Promise<DownloadedChatPhoto | null> {
  if (args.attachment.storage.kind !== 'chatkit') return null;

  const response = await args.fetchFile(args.attachment.storage.url);
  if (!response.ok) {
    throw new Error(`ChatKit photo download failed with HTTP ${response.status}`);
  }

  const responseContentType = headerValue(response.headers, 'content-type');
  const contentType = isSupportedLeadPhotoContentType(responseContentType)
    ? responseContentType
    : args.attachment.content_type;
  if (!isSupportedLeadPhotoContentType(contentType)) return null;

  const contentLengthHeader = headerValue(response.headers, 'content-length');
  const contentLength = Number.parseInt(contentLengthHeader, 10);
  if (Number.isFinite(contentLength) && contentLength > LEAD_PHOTO_LIMITS.maxBytesPerPhoto) {
    return null;
  }

  const content = Buffer.from(await response.arrayBuffer());
  if (!content.length || content.length > LEAD_PHOTO_LIMITS.maxBytesPerPhoto) return null;

  return {
    content,
    contentType,
    filename: sanitizeLeadAttachmentFilename(args.attachment.filename, contentType),
  };
}

export async function persistChatLeadPhotoAttachments({
  attachments,
  bucketName,
  fetchFile = fetch,
  s3,
  threadId,
}: PersistChatLeadPhotoAttachmentsArgs): Promise<{
  attachments: LeadAttachment[];
  loadedPhotoCount: number;
}> {
  if (!s3 || !bucketName.trim()) {
    return { attachments, loadedPhotoCount: 0 };
  }

  const persisted: LeadAttachment[] = [];
  let loadedPhotoCount = 0;
  let totalBytes = 0;
  const threadSegment = sanitizeLeadAttachmentPathSegment(threadId);

  for (const attachment of attachments) {
    if (attachment.storage.kind !== 'chatkit') {
      persisted.push(attachment);
      continue;
    }

    try {
      const photo = await downloadChatPhoto({ attachment, fetchFile });
      if (!photo || totalBytes + photo.content.length > LEAD_PHOTO_LIMITS.maxTotalBytes) {
        persisted.push(attachment);
        continue;
      }

      const key = [
        'chat',
        threadSegment,
        sanitizeLeadAttachmentPathSegment(attachment.attachment_id),
        photo.filename,
      ].join('/');

      await s3.send(
        new PutObjectCommand({
          Body: photo.content,
          Bucket: bucketName,
          ContentLength: photo.content.length,
          ContentType: photo.contentType,
          Key: key,
          Metadata: {
            'attachment-id': attachment.attachment_id,
            source: 'chat',
            'thread-id': threadId,
          },
        }),
      );

      persisted.push({
        ...attachment,
        byte_size: photo.content.length,
        content_type: photo.contentType,
        filename: photo.filename,
        storage: {
          kind: 's3',
          bucket: bucketName,
          key,
        },
      });
      loadedPhotoCount += 1;
      totalBytes += photo.content.length;
    } catch (error: unknown) {
      console.error('Failed to persist ChatKit lead attachment.', error);
      persisted.push(attachment);
    }
  }

  return { attachments: persisted, loadedPhotoCount };
}
