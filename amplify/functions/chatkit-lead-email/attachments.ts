import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { LeadAttachment } from './lead-types.ts';
import { safeHttpUrl } from './text-utils.ts';

export type AttachmentInfo = LeadAttachment;

export type InlineAttachment = {
  contentId: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  sourceUrl: string;
  transformed: boolean;
};

export type AttachmentResolution = {
  name: string;
  mime: string | null;
  status: 'attached' | 'omitted' | 'failed';
  contentId?: string | null;
  detail?: string | null;
};

export type PrepareAttachmentFailure = {
  attachment: AttachmentInfo;
  detail: string;
  ok: false;
};

export type PrepareAttachmentSuccess = {
  attachment: InlineAttachment;
  ok: true;
};

export type PrepareAttachmentResult = PrepareAttachmentFailure | PrepareAttachmentSuccess;

const EMAIL_SAFE_INLINE_MIME = new Set(['image/jpeg', 'image/png']);
const NORMALIZED_OUTPUT_MIME = 'image/jpeg';
const NORMALIZED_DEFAULT_QUALITY = 82;
const COMPACTED_QUALITY = 74;
const COMPACTED_MAX_DIMENSION = 1600;
const FETCH_TIMEOUT_MS = 8_000;

function decodeUriSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function sanitizeAttachmentFilename(value: string, mimeType: string): string {
  const normalized = typeof value === 'string' && value.trim() ? value.trim() : 'attachment';
  const safe = normalized.replace(/[<>:"/\\|?*]/g, '_').slice(0, 120);
  const base = safe.replace(/\.[^.]+$/, '');
  const extension =
    mimeType === 'image/png'
      ? '.png'
      : mimeType === 'image/webp'
        ? '.webp'
        : mimeType === 'image/heic'
          ? '.heic'
          : mimeType === 'image/heif'
            ? '.heif'
            : '.jpg';
  return `${base || 'attachment'}${extension}`;
}

function pickAttachmentMime(mime: string | null): string {
  const normalized = (mime ?? '').trim().toLowerCase().split(';')[0]?.trim() ?? '';
  if (normalized.startsWith('image/')) return normalized;
  return 'image/jpeg';
}

function isInlineImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}

function shouldNormalizeForEmail(mime: string): boolean {
  return !EMAIL_SAFE_INLINE_MIME.has(mime);
}

function buildInlineAttachment(
  attachment: AttachmentInfo,
  args: {
    bytes: Buffer;
    mimeType: string;
    transformed: boolean;
  },
): InlineAttachment {
  return {
    bytes: args.bytes,
    contentId: `attachment-${randomUUID()}@craigs.autos`,
    filename: sanitizeAttachmentFilename(attachment.name, args.mimeType),
    mimeType: args.mimeType,
    sourceUrl: attachment.url,
    transformed: args.transformed,
  };
}

function formatAttachmentDetail(detail: string): string {
  return detail.replace(/_/g, ' ');
}

export function buildResolutionFromInlineAttachment(
  attachment: AttachmentInfo,
  inlineAttachment: InlineAttachment,
): AttachmentResolution {
  return {
    contentId: inlineAttachment.contentId,
    detail: inlineAttachment.transformed ? 'Normalized for email delivery.' : null,
    mime: inlineAttachment.mimeType,
    name: attachment.name,
    status: 'attached',
  };
}

export function buildResolutionFromFailure(
  attachment: AttachmentInfo,
  detail: string,
): AttachmentResolution {
  return {
    detail: formatAttachmentDetail(detail),
    mime: attachment.mime,
    name: attachment.name,
    status: 'failed',
  };
}

export function buildResolutionFromOmission(
  attachment: AttachmentInfo,
  detail = 'Omitted to fit the email size budget.',
): AttachmentResolution {
  return {
    detail,
    mime: attachment.mime,
    name: attachment.name,
    status: 'omitted',
  };
}

async function normalizeToJpeg(bytes: Buffer, compact: boolean): Promise<Buffer> {
  let pipeline = sharp(bytes, { failOn: 'none' }).rotate();
  if (compact) {
    pipeline = pipeline.resize({
      fit: 'inside',
      height: COMPACTED_MAX_DIMENSION,
      width: COMPACTED_MAX_DIMENSION,
      withoutEnlargement: true,
    });
  }
  return pipeline
    .jpeg({
      mozjpeg: true,
      quality: compact ? COMPACTED_QUALITY : NORMALIZED_DEFAULT_QUALITY,
    })
    .toBuffer();
}

function normalizeContentType(value: string | null, fallback: string): string {
  return pickAttachmentMime(value ?? fallback);
}

async function maybeNormalizeAttachment(
  attachment: AttachmentInfo,
  args: {
    bytes: Buffer;
    compact: boolean;
    mimeType: string;
  },
): Promise<InlineAttachment> {
  if (!args.compact && !shouldNormalizeForEmail(args.mimeType)) {
    return buildInlineAttachment(attachment, {
      bytes: args.bytes,
      mimeType: args.mimeType,
      transformed: false,
    });
  }

  const normalizedBytes = await normalizeToJpeg(args.bytes, args.compact);
  return buildInlineAttachment(attachment, {
    bytes: normalizedBytes,
    mimeType: NORMALIZED_OUTPUT_MIME,
    transformed: true,
  });
}

function parseFetchFailure(err: unknown): string {
  if (err instanceof Error) {
    const message = decodeUriSafe(err.message).trim();
    if (message) return message;
  }
  return 'fetch_failed';
}

export async function prepareInlineAttachment(
  attachment: AttachmentInfo,
): Promise<PrepareAttachmentResult> {
  const sourceUrl = safeHttpUrl(attachment.url);
  if (!sourceUrl) {
    return { attachment, detail: 'invalid_source_url', ok: false };
  }

  const declaredMimeType = pickAttachmentMime(attachment.mime);
  if (!isInlineImageMime(declaredMimeType)) {
    return { attachment, detail: 'unsupported_mime_type', ok: false };
  }

  try {
    const response = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        attachment,
        detail: `fetch_http_${response.status}`,
        ok: false,
      };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) {
      return { attachment, detail: 'empty_attachment', ok: false };
    }

    const responseMimeType = normalizeContentType(
      response.headers.get('content-type'),
      declaredMimeType,
    );
    const inlineAttachment = await maybeNormalizeAttachment(attachment, {
      bytes,
      compact: false,
      mimeType: responseMimeType,
    });

    return {
      attachment: {
        ...inlineAttachment,
        sourceUrl,
      },
      ok: true,
    };
  } catch (err: unknown) {
    return {
      attachment,
      detail: parseFetchFailure(err),
      ok: false,
    };
  }
}

export async function compactInlineAttachment(
  attachment: InlineAttachment,
): Promise<InlineAttachment | null> {
  try {
    const compactedBytes = await normalizeToJpeg(attachment.bytes, true);
    if (!compactedBytes.length || compactedBytes.length >= attachment.bytes.length) {
      return null;
    }

    return {
      ...attachment,
      bytes: compactedBytes,
      filename: sanitizeAttachmentFilename(attachment.filename, NORMALIZED_OUTPUT_MIME),
      mimeType: NORMALIZED_OUTPUT_MIME,
      transformed: true,
    };
  } catch {
    return null;
  }
}
