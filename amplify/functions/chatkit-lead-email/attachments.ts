import { randomUUID } from 'node:crypto';
import { safeHttpUrl } from './text-utils';

export type AttachmentInfo = {
  name: string;
  mime: string | null;
  url: string;
  storageKey?: string | null;
};

export type InlineAttachment = {
  contentId: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  sourceUrl: string;
};

type TranscriptLineLike = {
  text: string;
};

function decodeUriSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseAttachmentStorageKey(urlText: string): string {
  try {
    const parsedUrl = new URL(urlText);
    const rawId = parsedUrl.searchParams.get('id') ?? '';
    if (rawId) {
      const decoded = decodeUriSafe(rawId).trim();
      if (decoded && /^[A-Za-z0-9._/-]+$/.test(decoded) && !decoded.includes('..')) return decoded;
    }

    const pathSegment = parsedUrl.pathname.split('/').filter(Boolean).pop() ?? '';
    if (pathSegment && /^[A-Za-z0-9._/-]+$/.test(pathSegment) && !pathSegment.includes('..')) {
      return pathSegment;
    }
  } catch {
    // ignore
  }
  return '';
}

function sanitizeAttachmentFilename(value: string, mimeType: string): string {
  const normalized = typeof value === 'string' && value.trim() ? value.trim() : 'attachment';
  const safe = normalized.replace(/[<>:"/\\|?*]/g, '_').slice(0, 120);
  const hasExt = /\.[^.]+$/.test(safe);
  if (hasExt) return safe;

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
  return `${safe}${extension}`;
}

function pickAttachmentMime(mime: string | null): string {
  const normalized = (mime ?? '').trim().toLowerCase();
  if (normalized.startsWith('image/')) return normalized;
  return 'image/jpeg';
}

function isInlineImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}

export function extractAttachments(transcript: TranscriptLineLike[]): AttachmentInfo[] {
  const seen = new Set<string>();
  const attachments: AttachmentInfo[] = [];

  for (const line of transcript) {
    const rows = typeof line.text === 'string' ? line.text.split('\n') : [];
    for (const row of rows) {
      if (!row.startsWith('Attachment:')) continue;
      let rest = row.replace(/^Attachment:\s*/, '').trim();
      if (!rest) continue;

      const urlMatch = rest.match(/https?:\/\/\S+$/);
      const urlRaw = urlMatch?.[0] ?? '';
      const urlSafe = urlRaw ? safeHttpUrl(urlRaw) : null;
      if (!urlSafe) continue;

      rest = rest.slice(0, Math.max(0, rest.length - urlRaw.length)).trim();

      let mime: string | null = null;
      const mimeMatch = rest.match(/\(([^)]+)\)\s*$/);
      if (mimeMatch && typeof mimeMatch.index === 'number') {
        mime = mimeMatch[1]?.trim() ? mimeMatch[1].trim() : null;
        rest = rest.slice(0, mimeMatch.index).trim();
      }

      const name = rest || 'attachment';
      if (seen.has(urlSafe)) continue;
      seen.add(urlSafe);
      const storageKey = parseAttachmentStorageKey(urlSafe);
      attachments.push({ name, mime, url: urlSafe, storageKey: storageKey || null });
    }
  }

  return attachments;
}

export async function fetchInlineAttachment(
  attachment: AttachmentInfo,
  maxBytes: number,
): Promise<InlineAttachment | null> {
  const sourceUrl = safeHttpUrl(attachment.url);
  if (!sourceUrl) return null;
  const mimeType = pickAttachmentMime(attachment.mime);
  if (!isInlineImageMime(mimeType)) return null;

  try {
    const response = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > maxBytes) return null;

    const contentType = pickAttachmentMime(response.headers.get('content-type') ?? mimeType);
    const filename = sanitizeAttachmentFilename(attachment.name, contentType);
    const contentId = `attachment-${randomUUID()}@craigs.autos`;
    return {
      contentId,
      filename,
      mimeType: contentType,
      bytes,
      sourceUrl,
    };
  } catch {
    return null;
  }
}
