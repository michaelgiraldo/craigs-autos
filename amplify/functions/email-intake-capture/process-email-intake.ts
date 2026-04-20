import { createHash } from 'node:crypto';
import {
  createQuoteRequestRecord,
  type QuoteRequestRecord,
} from '../_lead-platform/domain/quote-request.ts';
import { isPlausibleEmail, normalizeWhitespace } from '../_shared/text-utils.ts';
import { parseInboundEmail } from './mime.ts';
import type {
  EmailIntakeDeps,
  EmailIntakeLedgerStatus,
  ParsedInboundEmail,
  S3EmailIntakeEvent,
  S3EmailSource,
} from './types.ts';

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

function normalizeMessageId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed : `<${trimmed}>`;
}

function parseS3Sources(event: S3EmailIntakeEvent): S3EmailSource[] {
  return (event.Records ?? [])
    .map((record) => {
      const bucket = record.s3?.bucket?.name?.trim();
      const rawKey = record.s3?.object?.key?.trim();
      if (!bucket || !rawKey) return null;
      return {
        bucket,
        key: decodeURIComponent(rawKey.replace(/\+/g, ' ')),
      };
    })
    .filter((source): source is S3EmailSource => Boolean(source));
}

function addressMatches(value: string, expected: string): boolean {
  return value.trim().toLowerCase() === expected.trim().toLowerCase();
}

function anyAddressMatches(email: ParsedInboundEmail, expected: string): boolean {
  return [...email.to, ...email.cc].some((item) => addressMatches(item.address, expected));
}

function validateRoute(
  email: ParsedInboundEmail,
  deps: EmailIntakeDeps,
): { ok: boolean; status: string } {
  const expectedRoute = deps.config.googleRouteHeaderValue.trim();
  const routeHeader = email.header('x-craigs-google-route').trim();
  if (expectedRoute && routeHeader === expectedRoute) {
    return { ok: true, status: 'google_route_header' };
  }

  const originalTo = email.header('x-gm-original-to').trim();
  if (originalTo && addressMatches(originalTo, deps.config.originalRecipient)) {
    return { ok: true, status: 'google_original_to' };
  }

  if (deps.config.allowDirectIntake && anyAddressMatches(email, deps.config.intakeRecipient)) {
    return { ok: true, status: 'direct_intake_recipient' };
  }

  return { ok: false, status: 'missing_expected_google_route' };
}

function skipReason(email: ParsedInboundEmail): string | null {
  const from = email.from?.address.toLowerCase() ?? '';
  const autoSubmitted = email.header('auto-submitted').toLowerCase();
  const precedence = email.header('precedence').toLowerCase();
  const contentType = email.header('content-type').toLowerCase();
  const subject = email.subject.toLowerCase();

  if (from.endsWith('@craigs.autos')) return 'internal_sender';
  if (email.inReplyTo || email.references) return 'existing_email_thread';
  if (autoSubmitted && autoSubmitted !== 'no') return 'auto_submitted';
  if (['bulk', 'junk', 'list'].includes(precedence)) return 'bulk_or_list';
  if (email.header('list-id')) return 'mailing_list';
  if (from.startsWith('mailer-daemon@') || from.startsWith('postmaster@')) return 'mailer_daemon';
  if (contentType.includes('multipart/report')) return 'delivery_report';
  if (subject.includes('delivery status notification') || subject.includes('undeliverable')) {
    return 'delivery_failure';
  }
  return null;
}

function buildThreadKey(email: ParsedInboundEmail): string {
  const threadSource =
    email.references.split(/\s+/).find(Boolean) ||
    email.inReplyTo ||
    normalizeMessageId(email.messageId) ||
    [email.from?.address.toLowerCase() ?? 'unknown', cleanupSubject(email.subject)].join(':');
  return `email:${sha256(threadSource).slice(0, 32)}`;
}

function buildMessageLedgerKey(email: ParsedInboundEmail, source: S3EmailSource): string {
  const messageSource = normalizeMessageId(email.messageId) || `${source.bucket}/${source.key}`;
  return `message:${sha256(messageSource).slice(0, 40)}`;
}

function ttlFromNow(now: number): number {
  return now + LEDGER_TTL_DAYS * 24 * 60 * 60;
}

async function markBoth(
  deps: EmailIntakeDeps,
  args: {
    messageLedgerKey: string;
    reason?: string;
    status: EmailIntakeLedgerStatus;
    threadLedgerKey: string;
  },
) {
  await Promise.all([
    deps.ledger.markStatus({
      key: args.messageLedgerKey,
      reason: args.reason,
      status: args.status,
    }),
    deps.ledger.markStatus({
      key: args.threadLedgerKey,
      reason: args.reason,
      status: args.status,
    }),
  ]);
}

function createRecord(args: {
  deps: EmailIntakeDeps;
  email: ParsedInboundEmail;
  evaluation: Awaited<ReturnType<EmailIntakeDeps['evaluateLead']>>;
  leadContext: {
    contactId: string | null;
    journeyId: string | null;
    leadRecordId: string | null;
  };
  quoteRequestId: string;
  routeStatus: string;
  source: S3EmailSource;
  threadKey: string;
}): QuoteRequestRecord {
  const now = args.deps.nowEpochSeconds();
  const customerMessage = normalizeWhitespace(
    args.evaluation.projectSummary || args.email.text || args.email.subject || 'Inbound email lead',
  ).slice(0, 4_000);
  const record = createQuoteRequestRecord({
    attribution: null,
    captureChannel: 'email',
    contactId: args.leadContext.contactId,
    email: args.evaluation.customerEmail ?? args.email.from?.address ?? '',
    emailThreadKey: args.threadKey,
    inboundAttachmentCount: args.email.attachmentCount,
    inboundEmailS3Bucket: args.source.bucket,
    inboundEmailS3Key: args.source.key,
    inboundEmailSubject: args.email.subject,
    inboundPhotoAttachmentCount: args.email.photoAttachments.length,
    inboundRouteStatus: args.routeStatus,
    journeyId: args.leadContext.journeyId,
    leadRecordId: args.leadContext.leadRecordId,
    locale: 'en',
    message: customerMessage,
    name: args.evaluation.customerName ?? args.email.from?.name ?? '',
    nowEpochSeconds: now,
    origin: `email:${args.deps.config.originalRecipient}`,
    pageUrl: '',
    phone: args.evaluation.customerPhone ?? '',
    preferredOutreachChannel: 'email',
    quoteRequestId: args.quoteRequestId,
    service: args.evaluation.service ?? '',
    siteLabel: args.deps.config.siteLabel,
    sourceMessageId: normalizeMessageId(args.email.messageId),
    sourceReferences: args.email.references,
    unsupportedAttachmentCount: args.email.unsupportedAttachmentCount,
    userId: '',
    vehicle: args.evaluation.vehicle ?? '',
  });

  record.ai_status = args.evaluation.aiError ? 'fallback' : 'generated';
  record.ai_model = args.deps.config.model;
  record.ai_error = args.evaluation.aiError;
  record.sms_body = args.evaluation.smsBody;
  record.email_subject = args.evaluation.emailSubject;
  record.email_body = args.evaluation.emailBody;
  record.missing_info = args.evaluation.missingInfo;
  return record;
}

export async function processEmailIntakeEvent(event: S3EmailIntakeEvent, deps: EmailIntakeDeps) {
  if (!deps.configValid) {
    throw new Error('Email intake is missing required configuration');
  }

  const sources = parseS3Sources(event);
  const results: Array<Record<string, unknown>> = [];

  for (const source of sources) {
    const raw = await deps.getRawEmail(source);
    const email = await parseInboundEmail(raw);
    const now = deps.nowEpochSeconds();
    const messageLedgerKey = buildMessageLedgerKey(email, source);
    const threadKey = buildThreadKey(email);
    const threadLedgerKey = `thread:${threadKey}`;
    const messageReserved = await deps.ledger.reserve({
      key: messageLedgerKey,
      ttl: ttlFromNow(now),
      item: {
        bucket: source.bucket,
        key: source.key,
        message_id: normalizeMessageId(email.messageId),
        type: 'message',
      },
    });

    if (!messageReserved) {
      await deps.deleteRawEmail(source);
      results.push({ key: source.key, skipped: true, reason: 'duplicate_message' });
      continue;
    }

    const threadReserved = await deps.ledger.reserve({
      key: threadLedgerKey,
      ttl: ttlFromNow(now),
      item: {
        first_message_id: normalizeMessageId(email.messageId),
        thread_key: threadKey,
        type: 'thread',
      },
    });

    if (!threadReserved) {
      await deps.ledger.markStatus({
        key: messageLedgerKey,
        reason: 'thread_already_processed',
        status: 'skipped',
      });
      await deps.deleteRawEmail(source);
      results.push({ key: source.key, skipped: true, reason: 'thread_already_processed' });
      continue;
    }

    try {
      const route = validateRoute(email, deps);
      const preAiSkip = route.ok ? skipReason(email) : route.status;
      if (preAiSkip) {
        await markBoth(deps, {
          messageLedgerKey,
          threadLedgerKey,
          reason: preAiSkip,
          status: 'rejected',
        });
        await deps.deleteRawEmail(source);
        results.push({ key: source.key, rejected: true, reason: preAiSkip });
        continue;
      }

      const evaluation = await deps.evaluateLead({
        email,
        photos: email.photoAttachments,
      });

      const customerEmail = evaluation.customerEmail ?? email.from?.address ?? '';
      if (!evaluation.isLead || !isPlausibleEmail(customerEmail)) {
        const reason = evaluation.leadReason || 'not_a_lead';
        await markBoth(deps, {
          messageLedgerKey,
          threadLedgerKey,
          reason,
          status: 'rejected',
        });
        await deps.deleteRawEmail(source);
        results.push({ key: source.key, rejected: true, reason });
        continue;
      }

      const quoteRequestId = deps.createQuoteRequestId();
      const persistedLead = await deps.persistEmailLead({
        customerEmail,
        customerLanguage: evaluation.customerLanguage,
        customerMessage: evaluation.projectSummary || email.text,
        customerName: evaluation.customerName ?? email.from?.name ?? null,
        customerPhone: evaluation.customerPhone,
        emailIntakeId: quoteRequestId,
        messageId: normalizeMessageId(email.messageId),
        missingInfo: evaluation.missingInfo,
        originalRecipient: deps.config.originalRecipient,
        photoAttachmentCount: email.photoAttachments.length,
        projectSummary: evaluation.projectSummary,
        routeStatus: route.status,
        service: evaluation.service,
        subject: email.subject,
        threadKey,
        unsupportedAttachmentCount: email.unsupportedAttachmentCount,
        vehicle: evaluation.vehicle,
      });
      const record = createRecord({
        deps,
        email,
        evaluation: {
          ...evaluation,
          customerEmail,
        },
        leadContext: {
          contactId: persistedLead?.contactId ?? null,
          journeyId: persistedLead?.journeyId ?? null,
          leadRecordId: persistedLead?.leadRecordId ?? null,
        },
        quoteRequestId,
        routeStatus: route.status,
        source,
        threadKey,
      });

      await deps.queueQuoteRequest(record);
      await deps.invokeFollowup(quoteRequestId);
      await markBoth(deps, {
        messageLedgerKey,
        threadLedgerKey,
        status: 'queued',
      });
      results.push({ key: source.key, queued: true, quote_request_id: quoteRequestId });
    } catch (error: unknown) {
      await markBoth(deps, {
        messageLedgerKey,
        threadLedgerKey,
        reason: error instanceof Error ? error.message : 'email_intake_error',
        status: 'error',
      });
      throw error;
    }
  }

  return { ok: true, results };
}
