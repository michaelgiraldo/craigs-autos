import { randomUUID } from 'node:crypto';

export type OutgoingEmailAttachment = {
  content: Buffer;
  contentId?: string;
  contentType: string;
  filename: string;
  inline?: boolean;
};

export type RawEmailArgs = {
  attachments?: OutgoingEmailAttachment[];
  bcc?: string[];
  from: string;
  headers?: Record<string, string | null | undefined>;
  html: string;
  replyTo?: string;
  subject: string;
  text: string;
  to: string[];
};

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function encodeHeaderValue(value: string): string {
  const sanitized = sanitizeHeaderValue(value);
  if (/^[\x20-\x7e]*$/.test(sanitized) && sanitized.length <= 180) {
    return sanitized;
  }
  return `=?UTF-8?B?${Buffer.from(sanitized, 'utf8').toString('base64')}?=`;
}

function formatAddressList(addresses: string[]): string {
  return addresses.map(sanitizeHeaderValue).filter(Boolean).join(', ');
}

function chunkBase64(content: Buffer): string {
  const encoded = content.toString('base64');
  return encoded.match(/.{1,76}/g)?.join('\r\n') ?? '';
}

function boundary(label: string): string {
  return `----craigs-${label}-${randomUUID().replace(/-/g, '')}`;
}

function renderHeaders(headers: Record<string, string | null | undefined>): string[] {
  return Object.entries(headers)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([name, value]) => `${sanitizeHeaderValue(name)}: ${sanitizeHeaderValue(value)}`);
}

export function buildRawEmail(args: RawEmailArgs): Buffer {
  const mixedBoundary = boundary('mixed');
  const alternativeBoundary = boundary('alt');
  const attachments = args.attachments ?? [];
  const hasAttachments = attachments.length > 0;
  const rootBoundary = hasAttachments ? mixedBoundary : alternativeBoundary;
  const rootType = hasAttachments ? 'multipart/mixed' : 'multipart/alternative';

  const lines: string[] = [
    `From: ${sanitizeHeaderValue(args.from)}`,
    `To: ${formatAddressList(args.to)}`,
    ...(args.replyTo ? [`Reply-To: ${sanitizeHeaderValue(args.replyTo)}`] : []),
    `Subject: ${encodeHeaderValue(args.subject)}`,
    'MIME-Version: 1.0',
    ...renderHeaders(args.headers ?? {}),
    `Content-Type: ${rootType}; boundary="${rootBoundary}"`,
    '',
  ];

  if (hasAttachments) {
    lines.push(
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
      '',
    );
  }

  lines.push(
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    args.text,
    '',
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    args.html,
    '',
    `--${alternativeBoundary}--`,
  );

  if (hasAttachments) {
    for (const attachment of attachments) {
      const attachmentHeaders = [
        `Content-Type: ${sanitizeHeaderValue(attachment.contentType)}; name="${encodeHeaderValue(
          attachment.filename,
        )}"`,
        `Content-Disposition: ${attachment.inline ? 'inline' : 'attachment'}; filename="${encodeHeaderValue(
          attachment.filename,
        )}"`,
        ...(attachment.contentId
          ? [`Content-ID: <${sanitizeHeaderValue(attachment.contentId)}>`]
          : []),
        'Content-Transfer-Encoding: base64',
      ];
      lines.push(
        '',
        `--${mixedBoundary}`,
        ...attachmentHeaders,
        '',
        chunkBase64(attachment.content),
      );
    }
    lines.push('', `--${mixedBoundary}--`);
  }

  return Buffer.from(`${lines.join('\r\n')}\r\n`, 'utf8');
}
