import { InvokeCommand } from '@aws-sdk/client-lambda';
import { z } from 'zod';
import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';
import {
  createLeadFollowupWorkItem,
  type LeadFollowupWorkItem,
} from '../_lead-platform/domain/lead-followup-work.ts';
import { createChatLeadPhotoAttachments } from '../_lead-platform/domain/lead-attachment.ts';
import { createLeadSourceEvent } from '../_lead-platform/domain/lead-source-event.ts';
import {
  createStableJourneyId,
  createStableLeadFollowupWorkId,
} from '../_lead-platform/domain/ids.ts';
import { sanitizeAttributionSnapshot } from '../_lead-platform/domain/attribution.ts';
import { createLeadPlatformRuntime } from '../_lead-platform/runtime.ts';
import {
  captureLeadSource,
  LeadSourceCaptureError,
  shouldRepairLeadSourceWork,
} from '../_lead-platform/services/capture-lead-source.ts';
import { decodeBody, emptyResponse, getHttpMethod, jsonResponse } from '../_shared/http.ts';
import { getErrorDetails } from '../_shared/safe.ts';
import type {
  ChatHandoffResponse,
  ChatHandoffPromoteRequest,
  LambdaEvent,
  LambdaResult,
  LeadSummary,
  TranscriptLine,
} from './lead-types';
import { deleteLeadRetrySchedule, upsertLeadRetrySchedule } from './retry-scheduler.ts';
import {
  LEAD_IDLE_DELAY_SECONDS,
  LEAD_RETRY_GRACE_SECONDS,
  SHOP_NAME,
  SHOP_PHONE_DIGITS,
  SHOP_PHONE_DISPLAY,
  leadFollowupLambda,
  leadFollowupWorkerFunctionName,
  leadSummaryModel,
  nowEpochSeconds,
  openai,
  isValidThreadId,
} from './runtime.ts';
import { evaluateChatLead } from './evaluation.ts';
import { persistCapturedChatLead } from './promotion.ts';
import { existingWorkResponse } from './work-response.ts';
import { persistChatWorkflowEvent } from './workflow-events.ts';

const chatHandoffPromotePayloadSchema = z.looseObject({
  threadId: z.string().optional(),
  journey_id: z.string().optional(),
  locale: z.string().optional(),
  pageUrl: z.string().optional(),
  user: z.string().optional(),
  reason: z.string().optional(),
  attribution: z.unknown().optional(),
});

const leadPlatformRuntime = createLeadPlatformRuntime(process.env);

function formatChatLeadMessage(args: {
  leadSummary: LeadSummary;
  lines: TranscriptLine[];
}): string {
  const summary = args.leadSummary.summary?.trim() || 'Chat lead captured from website chat.';
  const transcript = args.lines
    .map((line) => `${line.speaker}: ${line.text}`.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 3_000);

  if (!transcript) return summary.slice(0, 4_000);
  return `${summary}\n\nTranscript:\n${transcript}`.slice(0, 4_000);
}

async function invokeLeadFollowupWorker(idempotencyKey: string): Promise<void> {
  if (!leadFollowupLambda || !leadFollowupWorkerFunctionName.trim()) {
    throw new Error('Lead follow-up worker is not configured');
  }

  await leadFollowupLambda.send(
    new InvokeCommand({
      FunctionName: leadFollowupWorkerFunctionName,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify({ idempotency_key: idempotencyKey })),
    }),
  );
}

export const handler = async (
  event: LambdaEvent | ChatHandoffPromoteRequest,
  context?: { invokedFunctionArn?: string },
): Promise<LambdaResult> => {
  const httpEvent = event as LambdaEvent;
  const method = getHttpMethod(httpEvent);
  const isHttpRequest = typeof method === 'string' && method.length > 0;

  if (isHttpRequest && method === 'OPTIONS') {
    // The public API layer handles browser preflight responses.
    return emptyResponse(204);
  }

  if (isHttpRequest && method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (!openai || !leadPlatformRuntime.configValid || !leadFollowupLambda) {
    return jsonResponse(500, { error: 'Server missing configuration' });
  }

  let payload: ChatHandoffPromoteRequest = {};
  if (isHttpRequest) {
    try {
      const body = decodeBody(httpEvent);
      const parsed = body ? JSON.parse(body) : {};
      const result = chatHandoffPromotePayloadSchema.safeParse(
        parsed && typeof parsed === 'object' ? parsed : {},
      );
      if (!result.success) {
        return jsonResponse(400, { error: 'Invalid request payload' });
      }
      payload = result.data;
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' });
    }
  } else if (event && typeof event === 'object') {
    const result = chatHandoffPromotePayloadSchema.safeParse(event);
    if (!result.success) {
      return jsonResponse(400, { error: 'Invalid request payload' });
    }
    payload = result.data;
  }

  const threadId = typeof payload.threadId === 'string' ? payload.threadId : '';
  if (!threadId || !isValidThreadId(threadId)) {
    return jsonResponse(400, { error: 'Missing or invalid threadId' });
  }

  const journeyId = createStableJourneyId({
    providedJourneyId: typeof payload.journey_id === 'string' ? payload.journey_id : null,
    fallbackKind: 'chat_thread',
    fallbackValue: threadId,
  });
  const locale = typeof payload.locale === 'string' ? payload.locale : '';
  const pageUrl = typeof payload.pageUrl === 'string' ? payload.pageUrl : '';
  const chatUser = typeof payload.user === 'string' ? payload.user : 'anonymous';
  const reason = typeof payload.reason === 'string' ? payload.reason : 'auto';
  const attribution = sanitizeAttributionSnapshot(payload.attribution);
  const functionArn =
    typeof context?.invokedFunctionArn === 'string' ? context.invokedFunctionArn : '';
  const repos = leadPlatformRuntime.repos;
  if (!repos) {
    return jsonResponse(500, { error: 'Server missing configuration' });
  }

  try {
    const existingWork = await repos.followupWork.getByIdempotencyKey(`chat:${threadId}`);
    if (existingWork && !shouldRepairLeadSourceWork(existingWork)) {
      return jsonResponse(200, existingWorkResponse(existingWork));
    }

    const evaluation = await evaluateChatLead({
      openai,
      threadId,
      assistantName: "Craig's Auto Upholstery Intake",
      locale,
      pageUrl,
      shopName: SHOP_NAME,
      shopPhoneDisplay: SHOP_PHONE_DISPLAY,
      shopPhoneDigits: SHOP_PHONE_DIGITS,
      leadSummaryModel,
      idleDelaySeconds: LEAD_IDLE_DELAY_SECONDS,
      currentEpochSeconds: nowEpochSeconds(),
    });

    if (evaluation.outcome === 'blocked') {
      await persistChatWorkflowEvent({
        repos,
        journeyId,
        threadId,
        eventName: LEAD_EVENTS.chatHandoffBlocked,
        occurredAtMs: Date.now(),
        recordedAtMs: Date.now(),
        reason: evaluation.reason,
        locale,
        pageUrl,
        userId: evaluation.threadUser ?? chatUser,
        attribution,
      });
      return jsonResponse(200, {
        ok: true,
        status: 'blocked',
        reason: evaluation.reason,
      } satisfies ChatHandoffResponse);
    }

    if (evaluation.outcome === 'deferred') {
      const currentEpoch = nowEpochSeconds();
      const scheduledFor = Math.max(
        evaluation.lastMessageAt + LEAD_IDLE_DELAY_SECONDS + LEAD_RETRY_GRACE_SECONDS,
        currentEpoch + LEAD_RETRY_GRACE_SECONDS,
      );
      const retryScheduled = await upsertLeadRetrySchedule({
        threadId,
        runAtEpochSeconds: scheduledFor,
        functionArn,
        payload: {
          threadId,
          journey_id: journeyId,
          locale,
          pageUrl,
          user: evaluation.threadUser ?? chatUser,
          reason: 'server_retry',
          attribution,
        },
      });
      await persistChatWorkflowEvent({
        repos,
        journeyId,
        threadId,
        eventName: LEAD_EVENTS.chatHandoffDeferred,
        occurredAtMs: Date.now(),
        recordedAtMs: Date.now(),
        reason: evaluation.reason,
        locale,
        pageUrl,
        userId: evaluation.threadUser ?? chatUser,
        attribution,
      });
      return jsonResponse(200, {
        ok: true,
        status: 'deferred',
        reason: evaluation.reason,
        last_activity_at: evaluation.lastMessageAt,
        idle_seconds: LEAD_IDLE_DELAY_SECONDS,
        seconds_since_last_activity: evaluation.secondsSinceLastActivity,
        retry_scheduled: retryScheduled,
        scheduled_for: scheduledFor,
      } satisfies ChatHandoffResponse);
    }
    const {
      attachments,
      threadTitle,
      threadUser,
      lines,
      leadSummary,
      customerPhone,
      customerEmail,
    } = evaluation;
    const chatPhotoManifest = createChatLeadPhotoAttachments(attachments);

    const idempotencyKey = `chat:${threadId}`;
    const followupWorkId = createStableLeadFollowupWorkId({ idempotencyKey, prefix: 'chat' });
    const sourceEvent = createLeadSourceEvent({
      attribution,
      contactId: null,
      email: customerEmail ?? leadSummary.customer_email ?? '',
      idempotencyKey,
      journeyId,
      leadRecordId: null,
      locale,
      message: formatChatLeadMessage({ leadSummary, lines }),
      metadata: {
        attachment_count: attachments.length,
        photo_attachment_count: chatPhotoManifest.attachments.length,
        reason,
        thread_title: threadTitle,
        unsupported_attachment_count: chatPhotoManifest.unsupportedCount,
      },
      name: leadSummary.customer_name,
      occurredAtMs: nowEpochSeconds() * 1000,
      origin: `chat:${reason}`,
      pageUrl,
      phone: customerPhone ?? leadSummary.customer_phone ?? '',
      service: leadSummary.project ?? '',
      siteLabel: SHOP_NAME,
      source: 'chat',
      sourceEventId: threadId,
      userId: threadUser ?? chatUser,
      vehicle: leadSummary.vehicle ?? '',
    });

    const workItem: LeadFollowupWorkItem = createLeadFollowupWorkItem({
      attribution: sourceEvent.attribution,
      captureChannel: sourceEvent.source,
      contactId: sourceEvent.contact_id,
      email: sourceEvent.email,
      followupWorkId,
      idempotencyKey: sourceEvent.idempotency_key,
      journeyId: sourceEvent.journey_id,
      leadRecordId: sourceEvent.lead_record_id,
      locale: sourceEvent.locale,
      message: sourceEvent.message,
      customerLanguage: leadSummary.customer_language ?? locale,
      name: sourceEvent.name,
      nowEpochSeconds: nowEpochSeconds(),
      origin: sourceEvent.origin,
      pageUrl: sourceEvent.page_url,
      phone: sourceEvent.phone,
      preferredOutreachChannel: 'sms',
      service: sourceEvent.service,
      siteLabel: sourceEvent.site_label,
      sourceEventId: sourceEvent.source_event_id,
      attachments: chatPhotoManifest.attachments,
      attachmentCount: attachments.length,
      photoAttachmentCount: chatPhotoManifest.attachments.length,
      unsupportedAttachmentCount: chatPhotoManifest.unsupportedCount,
      chatThreadId: threadId,
      chatThreadTitle: threadTitle,
      userId: sourceEvent.user_id,
      vehicle: sourceEvent.vehicle,
    });

    let receipt: Awaited<ReturnType<typeof captureLeadSource>>;
    try {
      receipt = await captureLeadSource({
        invokeFollowup: invokeLeadFollowupWorker,
        nowEpochSeconds,
        persistLead: async () => {
          const persistedLead = await persistCapturedChatLead({
            repos,
            threadId,
            journeyId,
            reason,
            locale,
            pageUrl,
            userId: threadUser ?? chatUser,
            attribution,
            leadSummary,
            customerPhone,
            customerEmail,
            nowEpochSeconds,
          });
          return {
            contactId: persistedLead?.contactId ?? null,
            journeyId: persistedLead?.journeyId ?? journeyId,
            leadRecordId: persistedLead?.leadRecordId ?? null,
          };
        },
        repos,
        workItem,
      });
    } catch (error: unknown) {
      if (error instanceof LeadSourceCaptureError && error.stage === 'invoke_worker') {
        const { message } = getErrorDetails(error);
        await persistChatWorkflowEvent({
          repos,
          journeyId,
          threadId,
          eventName: LEAD_EVENTS.chatHandoffError,
          occurredAtMs: Date.now(),
          recordedAtMs: Date.now(),
          reason: message ?? 'lead_followup_worker_invoke_failed',
          locale,
          pageUrl,
          userId: threadUser ?? chatUser,
          attribution,
        });
        return jsonResponse(502, { error: 'Unable to submit chat handoff right now.' });
      }
      throw error;
    }

    if (receipt.status !== 'accepted') {
      return jsonResponse(
        200,
        receipt.workItem
          ? existingWorkResponse(receipt.workItem)
          : ({
              ok: true,
              status: receipt.status,
              reason: 'followup_reserved',
              followup_work_id: receipt.followupWorkId,
              followup_work_status: receipt.followupWorkStatus,
            } satisfies ChatHandoffResponse),
      );
    }

    try {
      await deleteLeadRetrySchedule(threadId);
    } catch (error: unknown) {
      console.error('Failed to delete chat handoff retry schedule.', error);
    }

    return jsonResponse(200, {
      ok: true,
      status: 'accepted',
      reason,
      followup_work_id: receipt.followupWorkId,
      followup_work_status: receipt.followupWorkStatus,
      ...(receipt.leadRecordId ? { lead_record_id: receipt.leadRecordId } : {}),
    } satisfies ChatHandoffResponse);
  } catch (err: unknown) {
    const { name, message } = getErrorDetails(err);
    console.error('Chat handoff promotion failed', name, message);
    await persistChatWorkflowEvent({
      repos,
      journeyId,
      threadId,
      eventName: LEAD_EVENTS.chatHandoffError,
      occurredAtMs: Date.now(),
      recordedAtMs: Date.now(),
      reason: message ?? 'chat_lead_handoff_failed',
      locale,
      pageUrl,
      userId: chatUser,
      attribution,
    });
    return jsonResponse(500, { error: 'Failed to promote chat handoff' });
  }
};
