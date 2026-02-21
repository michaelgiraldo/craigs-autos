import { escapeHtml, safeHttpUrl } from './text-utils';
import type { InlineAttachment } from './attachments';

function toEncodedHeaderWord(value: string): string {
  const safeValue = value.replace(/[\r\n]+/g, ' ');
  if (/^[\x20-\x7e]*$/.test(safeValue)) return safeValue;
  const encoded = Buffer.from(safeValue, 'utf8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

function chunkBase64(value: string, lineLength = 76): string {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += lineLength) {
    chunks.push(value.slice(i, i + lineLength));
  }
  return chunks.join('\r\n');
}

function toBase64(value: string): string {
  return chunkBase64(Buffer.from(value, 'utf8').toString('base64'));
}

export function buildRawEmail(args: {
  from: string;
  to: string;
  replyTo?: string | null;
  subject: string;
  textBody: string;
  htmlBody: string;
  attachments: InlineAttachment[];
  mixedBoundary: string;
  alternativeBoundary: string;
}): Buffer {
  const lines: string[] = [];

  lines.push(`From: ${toEncodedHeaderWord(args.from)}`);
  lines.push(`To: ${toEncodedHeaderWord(args.to)}`);
  if (args.replyTo) lines.push(`Reply-To: ${toEncodedHeaderWord(args.replyTo)}`);
  lines.push(`Subject: ${toEncodedHeaderWord(args.subject)}`);
  lines.push('MIME-Version: 1.0');
  lines.push(`Content-Type: multipart/mixed; boundary="${args.mixedBoundary}"`);
  lines.push('');
  lines.push(`--${args.mixedBoundary}`);
  lines.push(`Content-Type: multipart/alternative; boundary="${args.alternativeBoundary}"`);
  lines.push('');
  lines.push(`--${args.alternativeBoundary}`);
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(toBase64(args.textBody));
  lines.push(`--${args.alternativeBoundary}`);
  lines.push('Content-Type: text/html; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(toBase64(args.htmlBody));
  lines.push(`--${args.alternativeBoundary}--`);

  for (const attachment of args.attachments) {
    lines.push(`--${args.mixedBoundary}`);
    lines.push(`Content-Type: ${attachment.mimeType}`);
    lines.push(`Content-ID: <${attachment.contentId}>`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push(
      `Content-Disposition: inline; filename="${attachment.filename.replace(/"/g, '\\"')}"`,
    );
    lines.push('');
    lines.push(chunkBase64(attachment.bytes.toString('base64')));
  }

  lines.push(`--${args.mixedBoundary}--`);
  lines.push('');
  return Buffer.from(lines.join('\r\n'), 'utf8');
}

export function linkifyTextToHtml(text: string): string {
  const urlRegex = /https?:\/\/[^\s]+/g;
  let out = '';
  let lastIndex = 0;

  for (const match of text.matchAll(urlRegex)) {
    const raw = match?.[0] ?? '';
    if (!raw) continue;
    const index = typeof match.index === 'number' ? match.index : 0;
    out += escapeHtml(text.slice(lastIndex, index));

    const safe = safeHttpUrl(raw);
    if (safe) {
      out += `<a href="${escapeHtml(safe)}" style="color:#141cff;text-decoration:none">${escapeHtml(
        raw,
      )}</a>`;
    } else {
      out += escapeHtml(raw);
    }

    lastIndex = index + raw.length;
  }

  out += escapeHtml(text.slice(lastIndex));
  return out.replace(/\n/g, '<br/>');
}
