import { extname } from 'node:path';

export type AttachmentUploadErrorCode =
  | 'attachment_too_large'
  | 'invalid_attachment_id'
  | 'missing_attachment_id'
  | 'storage_not_configured'
  | 'unsupported_mime_type';

export class AttachmentUploadError extends Error {
  readonly code: AttachmentUploadErrorCode;

  constructor(code: AttachmentUploadErrorCode, message: string) {
    super(message);
    this.name = 'AttachmentUploadError';
    this.code = code;
  }
}

export function sanitizeFilename(value: string): string {
  const normalized = value.trim().replace(/\0/g, '').slice(0, 180);
  if (!normalized) return 'attachment';
  return normalized.replace(/[<>:"/\\|?*]/g, '_');
}

export function sanitizeObjectId(value: string): string {
  if (!/^[A-Za-z0-9._/-]+$/.test(value)) return '';
  if (value.includes('..')) return '';
  return value;
}

export function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    case 'image/heic':
      return '.heic';
    case 'image/heif':
      return '.heif';
    default:
      return '';
  }
}

export function normalizeAttachmentFilename(rawName: string, mimeType: string): string {
  const sanitizedName = sanitizeFilename(rawName || 'image');
  const existingExtension = extname(sanitizedName);
  const extension = existingExtension || extensionForMimeType(mimeType);
  const baseName = existingExtension
    ? sanitizedName.slice(0, -existingExtension.length)
    : sanitizedName;
  return extension ? `${baseName}${extension}` : sanitizedName;
}

export function assertAttachmentCanBeStored({
  bytes,
  mimeType,
  maxBytes,
  allowedMimeTypes,
}: {
  bytes: Buffer;
  mimeType: string;
  maxBytes: number;
  allowedMimeTypes: Set<string>;
}) {
  if (bytes.length > maxBytes) {
    throw new AttachmentUploadError('attachment_too_large', 'Attachment too large');
  }

  if (!allowedMimeTypes.has(mimeType)) {
    throw new AttachmentUploadError('unsupported_mime_type', `Unsupported mime type: ${mimeType}`);
  }
}

export function assertAttachmentId(id: string) {
  if (!id) {
    throw new AttachmentUploadError('missing_attachment_id', 'Missing attachment id.');
  }

  const sanitizedId = sanitizeObjectId(id);
  if (!sanitizedId || sanitizedId !== id) {
    throw new AttachmentUploadError('invalid_attachment_id', 'Invalid attachment id.');
  }
}

export function assertStorageConfigured(bucketName?: string) {
  if (!bucketName) {
    throw new AttachmentUploadError(
      'storage_not_configured',
      'Attachment storage is not configured',
    );
  }
}
