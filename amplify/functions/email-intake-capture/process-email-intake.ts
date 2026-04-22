import { createStableLeadFollowupWorkId } from '../_lead-platform/domain/ids.ts';
import { createFallbackLeadSummary } from '../_lead-platform/domain/lead-summary.ts';
import { captureLeadSource } from '../_lead-platform/services/capture-lead-source.ts';
import { normalizeEmailMessageId } from '../_shared/email-threading.ts';
import { isPlausibleEmail } from '../_shared/text-utils.ts';
import { createEmailFollowupWork } from './followup-work.ts';
import {
  buildEmailMessageLedgerKey,
  buildEmailThreadKey,
  emailIntakeLedgerTtlFromNow,
} from './ledger-keys.ts';
import { parseInboundEmail } from './mime.ts';
import { getEmailPreAiSkipReason, validateEmailRoute } from './routing.ts';
import type {
  EmailIntakeDeps,
  EmailIntakeLedgerStatus,
  EmailLeadEvaluation,
  S3EmailIntakeEvent,
  S3EmailSource,
} from './types.ts';

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

function createManualReviewEvaluationFromEmail(args: {
  email: Awaited<ReturnType<typeof parseInboundEmail>>;
  reason: string;
}): EmailLeadEvaluation {
  const customerEmail = args.email.from?.address ?? null;
  const projectSummary = args.email.text || args.email.subject || 'Inbound email needs review.';

  return {
    aiError: args.reason,
    customerEmail,
    customerLanguage: null,
    customerName: args.email.from?.name ?? null,
    customerPhone: null,
    isLead: true,
    leadReason: args.reason,
    triageDecision: 'review',
    customerResponsePolicy: 'manual_review',
    customerResponsePolicyReason: args.reason,
    leadSummary: createFallbackLeadSummary({
      captureChannel: 'email',
      customerEmail,
      customerName: args.email.from?.name ?? null,
      customerMessage: projectSummary,
      missingInfo: ['AI email triage failed'],
      customerResponsePolicy: 'manual_review',
      customerResponsePolicyReason: args.reason,
    }),
    missingInfo: ['AI email triage failed'],
    projectSummary,
    service: null,
    vehicle: null,
  };
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
    const messageLedgerKey = buildEmailMessageLedgerKey(email, source);
    const threadKey = buildEmailThreadKey(email);
    const threadLedgerKey = `thread:${threadKey}`;
    const messageReserved = await deps.ledger.reserve({
      key: messageLedgerKey,
      ttl: emailIntakeLedgerTtlFromNow(now),
      item: {
        bucket: source.bucket,
        key: source.key,
        message_id: normalizeEmailMessageId(email.messageId),
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
      ttl: emailIntakeLedgerTtlFromNow(now),
      item: {
        first_message_id: normalizeEmailMessageId(email.messageId),
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
      const route = validateEmailRoute(email, deps);
      const preAiSkip = route.ok
        ? getEmailPreAiSkipReason(email, {
            allowTrustedContactGroupList: route.status === 'google_workspace_contact_group_route',
          })
        : route.status;
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

      let evaluation: EmailLeadEvaluation;
      try {
        evaluation = await deps.evaluateLead({
          email,
          photos: email.photoAttachments,
        });
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : 'email_triage_failed';
        evaluation = createManualReviewEvaluationFromEmail({ email, reason });
      }
      const leadSummary = {
        ...evaluation.leadSummary,
        photo_reference_count: email.photoAttachments.length,
        loaded_photo_count: email.photoAttachments.length,
        unsupported_attachment_count: email.unsupportedAttachmentCount,
      };

      const customerEmail = evaluation.customerEmail ?? email.from?.address ?? '';
      if (
        evaluation.triageDecision === 'reject' ||
        !evaluation.isLead ||
        !isPlausibleEmail(customerEmail)
      ) {
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

      if (!deps.repos) {
        throw new Error('Lead platform repositories are not configured');
      }

      const followupWorkId = createStableLeadFollowupWorkId({
        idempotencyKey: threadKey,
        prefix: 'email',
      });
      const record = createEmailFollowupWork({
        deps,
        email,
        evaluation: {
          ...evaluation,
          customerEmail,
          leadSummary,
        },
        leadContext: {
          contactId: null,
          journeyId: null,
          leadRecordId: null,
        },
        followupWorkId,
        routeStatus: route.status,
        source,
        threadKey,
      });

      const customerName = evaluation.customerName ?? email.from?.name ?? null;
      const customerNameFromAi = Boolean(evaluation.customerName);
      const receipt = await captureLeadSource({
        invokeFollowup: deps.invokeFollowup,
        nowEpochSeconds: deps.nowEpochSeconds,
        persistLead: () =>
          deps.persistEmailLead({
            customerEmail,
            customerLanguage: evaluation.customerLanguage,
            customerMessage: evaluation.projectSummary || email.text,
            customerName,
            customerNameConfidence: customerNameFromAi ? 'medium' : 'low',
            customerNameSourceMethod: customerNameFromAi ? 'ai_extracted' : 'email_header',
            customerPhone: evaluation.customerPhone,
            emailIntakeId: followupWorkId,
            messageId: normalizeEmailMessageId(email.messageId),
            missingInfo: evaluation.missingInfo,
            leadSummary,
            originalRecipient: deps.config.originalRecipient,
            photoAttachmentCount: email.photoAttachments.length,
            projectSummary: evaluation.projectSummary,
            routeStatus: route.status,
            service: evaluation.service,
            subject: email.subject,
            threadKey,
            unsupportedAttachmentCount: email.unsupportedAttachmentCount,
            vehicle: evaluation.vehicle,
          }),
        repos: deps.repos,
        workItem: record,
      });
      await markBoth(deps, {
        messageLedgerKey,
        threadLedgerKey,
        status: 'queued',
      });
      results.push({ key: source.key, queued: true, followup_work_id: receipt.followupWorkId });
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
