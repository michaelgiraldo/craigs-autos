import { createHash } from 'node:crypto';
import { normalizeEmailMessageId } from '../_shared/email-threading.ts';
import type { ParsedInboundEmail, S3EmailSource } from './types.ts';

const LEDGER_TTL_DAYS = 180;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function cleanupSubject(value: string): string {
  return value
    .toLowerCase()
    .replace(/^\s*(re|fw|fwd):\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildEmailThreadKey(email: ParsedInboundEmail): string {
  const threadSource =
    email.references.split(/\s+/).find(Boolean) ||
    email.inReplyTo ||
    normalizeEmailMessageId(email.messageId) ||
    [email.from?.address.toLowerCase() ?? 'unknown', cleanupSubject(email.subject)].join(':');
  return `email:${sha256(threadSource).slice(0, 32)}`;
}

export function buildEmailMessageLedgerKey(
  email: ParsedInboundEmail,
  source: S3EmailSource,
): string {
  const messageSource =
    normalizeEmailMessageId(email.messageId) || `${source.bucket}/${source.key}`;
  return `message:${sha256(messageSource).slice(0, 40)}`;
}

export function emailIntakeLedgerTtlFromNow(now: number): number {
  return now + LEDGER_TTL_DAYS * 24 * 60 * 60;
}
