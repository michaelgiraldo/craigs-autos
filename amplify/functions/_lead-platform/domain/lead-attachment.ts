import { createHash } from 'node:crypto';
import {
  LEAD_NOTIFICATION_EMAIL_ATTACHMENT_LIMITS,
  LEAD_PHOTO_CONTENT_TYPES,
  LEAD_PHOTO_LIMITS,
  type LeadPhotoContentType,
} from '@craigs/contracts/lead-attachment-contract';

export { LEAD_NOTIFICATION_EMAIL_ATTACHMENT_LIMITS, LEAD_PHOTO_CONTENT_TYPES, LEAD_PHOTO_LIMITS };
export type { LeadPhotoContentType };

export type LeadAttachmentSource = 'form' | 'email' | 'chat';

export type LeadAttachmentStorage =
  | {
      kind: 's3';
      bucket: string;
      key: string;
    }
  | {
      kind: 'email_raw';
      bucket: string;
      key: string;
      index: number;
    }
  | {
      kind: 'chatkit';
      id: string | null;
      url: string;
    };

export type LeadAttachment = {
  attachment_id: string;
  byte_size: number;
  content_type: string;
  disposition: 'customer_photo';
  filename: string;
  source: LeadAttachmentSource;
  status: 'supported';
  storage: LeadAttachmentStorage;
};

export type LeadPhotoCandidate<T = unknown> = {
  contentType: string;
  filename?: string | null;
  id?: string | null;
  item: T;
  size: number;
};

export type AcceptedLeadPhotoCandidate<T = unknown> = LeadPhotoCandidate<T> & {
  contentType: LeadPhotoContentType;
  filename: string;
};

export function normalizeLeadPhotoContentType(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isSupportedLeadPhotoContentType(
  value: string | null | undefined,
): value is LeadPhotoContentType {
  return LEAD_PHOTO_CONTENT_TYPES.includes(
    normalizeLeadPhotoContentType(value) as LeadPhotoContentType,
  );
}

export function extensionForLeadPhotoContentType(contentType: string): string {
  switch (normalizeLeadPhotoContentType(contentType)) {
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

export function sanitizeLeadAttachmentPathSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return sanitized || createHash('sha256').update(value).digest('hex').slice(0, 24);
}

export function sanitizeLeadAttachmentFilename(
  value: string | null | undefined,
  contentType: string,
  fallbackBase = 'photo',
): string {
  const extension = extensionForLeadPhotoContentType(contentType);
  const fallback = `${fallbackBase}.${extension}`;
  const sanitized = (value || fallback)
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[. -]+|[. -]+$/g, '')
    .slice(0, 120)
    .trim();
  const candidate = sanitized || fallback;
  return /\.[a-z0-9]{2,5}$/i.test(candidate) ? candidate : `${candidate}.${extension}`;
}

export function classifyLeadPhotoCandidates<T>(candidates: LeadPhotoCandidate<T>[]): {
  accepted: AcceptedLeadPhotoCandidate<T>[];
  unsupportedCount: number;
} {
  const accepted: AcceptedLeadPhotoCandidate<T>[] = [];
  let unsupportedCount = 0;
  let totalBytes = 0;

  for (const candidate of candidates) {
    const contentType = normalizeLeadPhotoContentType(candidate.contentType);
    const size = Number.isFinite(candidate.size) ? Math.trunc(candidate.size) : 0;

    if (
      !isSupportedLeadPhotoContentType(contentType) ||
      size <= 0 ||
      size > LEAD_PHOTO_LIMITS.maxBytesPerPhoto ||
      accepted.length >= LEAD_PHOTO_LIMITS.maxCount ||
      totalBytes + size > LEAD_PHOTO_LIMITS.maxTotalBytes
    ) {
      unsupportedCount += 1;
      continue;
    }

    accepted.push({
      ...candidate,
      contentType,
      filename: sanitizeLeadAttachmentFilename(
        candidate.filename,
        contentType,
        `photo-${accepted.length + 1}`,
      ),
      size,
    });
    totalBytes += size;
  }

  return { accepted, unsupportedCount };
}

export function countSupportedLeadPhotoAttachments(attachments: LeadAttachment[] = []): number {
  return attachments.filter(
    (attachment) =>
      attachment.status === 'supported' &&
      attachment.disposition === 'customer_photo' &&
      isSupportedLeadPhotoContentType(attachment.content_type),
  ).length;
}

export function createFormLeadPhotoAttachment(args: {
  attachmentId: string;
  bucket: string;
  byteSize: number;
  contentType: LeadPhotoContentType;
  filename: string;
  key: string;
}): LeadAttachment {
  return {
    attachment_id: args.attachmentId,
    byte_size: args.byteSize,
    content_type: args.contentType,
    disposition: 'customer_photo',
    filename: sanitizeLeadAttachmentFilename(args.filename, args.contentType),
    source: 'form',
    status: 'supported',
    storage: {
      kind: 's3',
      bucket: args.bucket,
      key: args.key,
    },
  };
}

export function createEmailLeadPhotoAttachments(args: {
  bucket: string;
  key: string;
  photos: Array<{
    byteSize: number;
    contentType: LeadPhotoContentType;
    filename: string;
  }>;
}): LeadAttachment[] {
  return args.photos.map((photo, index) => ({
    attachment_id: `email-photo-${index + 1}`,
    byte_size: photo.byteSize,
    content_type: photo.contentType,
    disposition: 'customer_photo',
    filename: sanitizeLeadAttachmentFilename(
      photo.filename,
      photo.contentType,
      `photo-${index + 1}`,
    ),
    source: 'email',
    status: 'supported',
    storage: {
      kind: 'email_raw',
      bucket: args.bucket,
      key: args.key,
      index,
    },
  }));
}

export function createChatLeadPhotoAttachments(
  attachments: Array<{
    id?: string | null;
    mime: string | null;
    name: string;
    url: string;
  }>,
): { attachments: LeadAttachment[]; unsupportedCount: number } {
  const classified = classifyLeadPhotoCandidates(
    attachments.map((attachment) => ({
      contentType: attachment.mime ?? '',
      filename: attachment.name,
      item: attachment,
      size: 1,
    })),
  );

  return {
    attachments: classified.accepted.map((candidate, index) => {
      const attachment = candidate.item;
      const idSource = attachment.id || attachment.url || `${attachment.name}:${index}`;
      const attachmentId = `chat-${createHash('sha256').update(idSource).digest('hex').slice(0, 24)}`;
      return {
        attachment_id: attachmentId,
        byte_size: 0,
        content_type: candidate.contentType,
        disposition: 'customer_photo',
        filename: candidate.filename,
        source: 'chat',
        status: 'supported',
        storage: {
          kind: 'chatkit',
          id: attachment.id ?? null,
          url: attachment.url,
        },
      };
    }),
    unsupportedCount: classified.unsupportedCount,
  };
}
