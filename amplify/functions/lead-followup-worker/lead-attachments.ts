import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import PostalMime, { type Attachment } from 'postal-mime';
import {
  LEAD_PHOTO_LIMITS,
  classifyLeadPhotoCandidates,
  isSupportedLeadPhotoContentType,
} from '../_lead-platform/domain/lead-attachment.ts';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import type { OutgoingEmailAttachment } from '../_shared/outgoing-email.ts';

const MAX_OWNER_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export type LoadedLeadPhotoAttachment = OutgoingEmailAttachment & {
  dataUrl: string;
};

function bufferFromAttachmentContent(content: Attachment['content']): Buffer {
  if (typeof content === 'string') return Buffer.from(content, 'base64');
  if (content instanceof ArrayBuffer) return Buffer.from(new Uint8Array(content));
  return Buffer.from(content);
}

function asLoadedPhoto(args: {
  content: Buffer;
  contentType: string;
  filename: string;
}): LoadedLeadPhotoAttachment | null {
  if (!isSupportedLeadPhotoContentType(args.contentType) || !args.content.length) return null;
  return {
    content: args.content,
    contentType: args.contentType,
    dataUrl: `data:${args.contentType};base64,${args.content.toString('base64')}`,
    filename: args.filename,
  };
}

async function bufferFromS3Object(args: {
  bucket: string;
  key: string;
  s3: S3Client;
}): Promise<Buffer | null> {
  const result = await args.s3.send(
    new GetObjectCommand({
      Bucket: args.bucket,
      Key: args.key,
    }),
  );
  const bytes = await result.Body?.transformToByteArray();
  return bytes ? Buffer.from(bytes) : null;
}

async function loadFormPhotos(args: {
  record: LeadFollowupWorkItem;
  s3: S3Client;
}): Promise<LoadedLeadPhotoAttachment[]> {
  const photos: LoadedLeadPhotoAttachment[] = [];
  for (const attachment of args.record.attachments ?? []) {
    if (attachment.storage.kind !== 's3') continue;
    try {
      const content = await bufferFromS3Object({
        bucket: attachment.storage.bucket,
        key: attachment.storage.key,
        s3: args.s3,
      });
      if (!content) continue;
      const loaded = asLoadedPhoto({
        content,
        contentType: attachment.content_type,
        filename: attachment.filename,
      });
      if (loaded) photos.push(loaded);
    } catch (error: unknown) {
      console.error('Failed to load form lead attachment.', error);
    }
  }
  return photos;
}

async function loadEmailPhotos(args: {
  record: LeadFollowupWorkItem;
  s3: S3Client;
}): Promise<LoadedLeadPhotoAttachment[]> {
  if (!args.record.inbound_email_s3_bucket || !args.record.inbound_email_s3_key) return [];

  try {
    const raw = await bufferFromS3Object({
      bucket: args.record.inbound_email_s3_bucket,
      key: args.record.inbound_email_s3_key,
      s3: args.s3,
    });
    if (!raw) return [];

    const parsed = await PostalMime.parse(raw, {
      attachmentEncoding: 'arraybuffer',
    });
    const candidates = parsed.attachments.map((attachment) => {
      const content = bufferFromAttachmentContent(attachment.content);
      return {
        contentType: attachment.mimeType,
        filename: attachment.filename,
        item: content,
        size: content.length,
      };
    });
    const classified = classifyLeadPhotoCandidates(candidates);
    return classified.accepted
      .map((candidate) =>
        asLoadedPhoto({
          content: candidate.item,
          contentType: candidate.contentType,
          filename: candidate.filename,
        }),
      )
      .filter((photo): photo is LoadedLeadPhotoAttachment => Boolean(photo));
  } catch (error: unknown) {
    console.error('Failed to load inbound email lead attachments.', error);
    return [];
  }
}

function applyOwnerEmailLimits(photos: LoadedLeadPhotoAttachment[]): LoadedLeadPhotoAttachment[] {
  const limited: LoadedLeadPhotoAttachment[] = [];
  let totalBytes = 0;
  for (const photo of photos) {
    if (photo.content.length > LEAD_PHOTO_LIMITS.maxBytesPerPhoto) continue;
    if (totalBytes + photo.content.length > MAX_OWNER_ATTACHMENT_BYTES) break;
    limited.push(photo);
    totalBytes += photo.content.length;
  }
  return limited;
}

export function createLeadPhotoAttachmentLoader(args: {
  s3: S3Client | null;
}): (record: LeadFollowupWorkItem) => Promise<LoadedLeadPhotoAttachment[]> {
  return async (record) => {
    if (!args.s3) return [];

    const [formPhotos, emailPhotos] = await Promise.all([
      loadFormPhotos({ record, s3: args.s3 }),
      loadEmailPhotos({ record, s3: args.s3 }),
    ]);

    return applyOwnerEmailLimits([...formPhotos, ...emailPhotos]);
  };
}
