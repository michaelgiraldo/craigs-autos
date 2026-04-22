import PostalMime, { type Address, type Attachment, type Email, type Mailbox } from 'postal-mime';
import { classifyLeadPhotoCandidates } from '../_lead-platform/domain/lead-attachment.ts';
import type { ParsedAddress, ParsedInboundEmail, ParsedPhotoAttachment } from './types.ts';

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function isMailbox(address: Address): address is Mailbox {
  return typeof address.address === 'string';
}

function flattenAddresses(addresses: Address[] | undefined): ParsedAddress[] {
  if (!addresses) return [];
  const flattened: Mailbox[] = [];
  for (const address of addresses) {
    if (isMailbox(address)) {
      flattened.push(address);
      continue;
    }
    flattened.push(...address.group);
  }
  return flattened
    .map((item) => ({
      address: item.address.trim(),
      name: item.name.trim(),
    }))
    .filter((item) => item.address);
}

function headerReader(email: Email): (name: string) => string {
  const map = new Map<string, string[]>();
  for (const header of email.headers) {
    const values = map.get(header.key) ?? [];
    values.push(header.value);
    map.set(header.key, values);
  }
  return (name) => map.get(name.toLowerCase())?.join(', ').trim() ?? '';
}

function attachmentContentBuffer(content: Attachment['content']): Buffer {
  if (typeof content === 'string') return Buffer.from(content, 'base64');
  if (content instanceof ArrayBuffer) return Buffer.from(new Uint8Array(content));
  return Buffer.from(content);
}

function parsePhotoAttachments(attachments: Attachment[]): {
  photos: ParsedPhotoAttachment[];
  unsupportedAttachmentCount: number;
} {
  const candidates = attachments.map((attachment) => {
    const content = attachmentContentBuffer(attachment.content);
    return {
      contentType: attachment.mimeType,
      filename: attachment.filename,
      item: content,
      size: content.length,
    };
  });
  const classified = classifyLeadPhotoCandidates(candidates);
  const photos = classified.accepted.map((candidate, index) => ({
    content: candidate.item,
    contentType: candidate.contentType,
    filename: candidate.filename || `photo-${index + 1}.jpg`,
  }));

  return { photos, unsupportedAttachmentCount: classified.unsupportedCount };
}

export async function parseInboundEmail(raw: Buffer): Promise<ParsedInboundEmail> {
  const email = await PostalMime.parse(raw, { attachmentEncoding: 'arraybuffer' });
  const header = headerReader(email);
  const from = flattenAddresses(email.from ? [email.from] : [])[0] ?? null;
  const text = (email.text?.trim() || (email.html ? stripHtml(email.html) : '')).slice(0, 20_000);
  const parsedAttachments = parsePhotoAttachments(email.attachments);

  return {
    attachmentCount: email.attachments.length,
    cc: flattenAddresses(email.cc),
    date: email.date ?? '',
    from,
    header,
    inReplyTo: email.inReplyTo?.trim() ?? '',
    messageId: email.messageId?.trim() || header('message-id'),
    photoAttachments: parsedAttachments.photos,
    references: email.references?.trim() ?? '',
    subject: email.subject?.trim() ?? '',
    text,
    to: flattenAddresses(email.to),
    unsupportedAttachmentCount: parsedAttachments.unsupportedAttachmentCount,
  };
}
