import { z } from 'zod';
import { LEAD_EVENTS } from '../../../shared/lead-event-contract.js';
import { createStableJourneyId } from '../_lead-core/domain/ids.ts';
import { sanitizeAttributionSnapshot } from '../_lead-core/domain/attribution.ts';
import { createLeadCoreRuntime } from '../_lead-core/runtime.ts';
import { decodeBody, emptyResponse, getHttpMethod, jsonResponse } from '../_shared/http.ts';
import { getErrorDetails } from '../_shared/safe.ts';
import {
  acquireLeadHandoffLease,
  getLeadDedupeRecord,
  markLeadHandoffError,
} from './dedupe-store.ts';
import type { ChatLeadHandoffRequest, LambdaEvent, LambdaResult } from './lead-types';
import { createMessageLinkUrl as createMessageLinkTokenUrl } from './message-link';
import { deleteLeadRetrySchedule, upsertLeadRetrySchedule } from './retry-scheduler.ts';
import {
  LEAD_IDLE_DELAY_SECONDS,
  LEAD_EMAIL_RAW_MESSAGE_MAX_BYTES,
  LEAD_RETRY_GRACE_SECONDS,
  MESSAGE_LINK_TOKEN_TTL_DAYS,
  SHOP_ADDRESS,
  SHOP_NAME,
  SHOP_PHONE_DIGITS,
  SHOP_PHONE_DISPLAY,
  leadFromEmail,
  leadSummaryModel,
  leadToEmail,
  messageLinkDb,
  messageLinkTokenTableName,
  nowEpochSeconds,
  openai,
  quoApiKey,
  quoEnabled,
  quoFromPhoneNumberId,
  quoContactExternalIdPrefix,
  quoContactSource,
  quoLeadTagsFieldKey,
  quoLeadTagsFieldName,
  quoUserId,
  ses,
  isValidThreadId,
} from './runtime.ts';
import { evaluateChatLead } from './evaluation.ts';
import { runChatOutreach } from './outreach-workflow.ts';
import { persistCapturedChatLead } from './promotion.ts';
import { persistChatWorkflowEvent } from './workflow-events.ts';

const chatLeadHandoffPayloadSchema = z.looseObject({
  threadId: z.string().optional(),
  journey_id: z.string().optional(),
  locale: z.string().optional(),
  pageUrl: z.string().optional(),
  user: z.string().optional(),
  reason: z.string().optional(),
  attribution: z.unknown().optional(),
});

const leadCoreRuntime = createLeadCoreRuntime(process.env);

export const handler = async (
  event: LambdaEvent | ChatLeadHandoffRequest,
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

  if (!openai || !leadCoreRuntime.configValid) {
    return jsonResponse(500, { error: 'Server missing configuration' });
  }

  let payload: ChatLeadHandoffRequest = {};
  if (isHttpRequest) {
    try {
      const body = decodeBody(httpEvent);
      const parsed = body ? JSON.parse(body) : {};
      const result = chatLeadHandoffPayloadSchema.safeParse(
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
    const result = chatLeadHandoffPayloadSchema.safeParse(event);
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
  const repos = leadCoreRuntime.repos;

  try {
    // Fast path: if this handoff is already complete, don't re-fetch transcripts or re-run outreach.
    const now = nowEpochSeconds();
    try {
      const record = await getLeadDedupeRecord(threadId);
      if (record?.status === 'completed') {
        return jsonResponse(200, {
          ok: true,
          completed: true,
          reason: 'already_completed',
          completed_at: record.completed_at ?? null,
        });
      }
      const lockExpiresAt =
        typeof record?.lock_expires_at === 'number' ? record.lock_expires_at : 0;
      if (record?.status === 'processing' && lockExpiresAt > now) {
        return jsonResponse(200, { ok: true, completed: false, reason: 'in_progress' });
      }
      if (record?.status === 'error' && lockExpiresAt > now) {
        return jsonResponse(200, { ok: true, completed: false, reason: 'cooldown' });
      }
    } catch (err: unknown) {
      const { name, message } = getErrorDetails(err);
      console.error('Lead dedupe read failed', name, message);
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
      return jsonResponse(200, { ok: true, completed: false, reason: evaluation.reason });
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
        completed: false,
        reason: evaluation.reason,
        last_activity_at: evaluation.lastMessageAt,
        idle_seconds: LEAD_IDLE_DELAY_SECONDS,
        seconds_since_last_activity: evaluation.secondsSinceLastActivity,
        retry_scheduled: retryScheduled,
        scheduled_for: scheduledFor,
      });
    }
    const {
      attachments,
      threadTitle,
      threadUser,
      lines,
      leadSummary,
      customerPhone,
      customerEmail,
      customerPhoneE164,
    } = evaluation;

    // Acquire a per-thread lease before handoff so we never run the completed workflow twice
    // for the same thread, even if multiple browser lifecycle events trigger this endpoint.
    const lease = await acquireLeadHandoffLease({ threadId, reason });
    if (!lease.acquired) {
      if (lease.record?.status === 'completed') {
        return jsonResponse(200, {
          ok: true,
          completed: true,
          reason: 'already_completed',
          completed_at: lease.record.completed_at ?? null,
        });
      }
      const lockExpiresAt =
        typeof lease.record?.lock_expires_at === 'number' ? lease.record.lock_expires_at : 0;
      if (lease.record?.status === 'error' && lockExpiresAt > nowEpochSeconds()) {
        return jsonResponse(200, { ok: true, completed: false, reason: 'cooldown' });
      }
      return jsonResponse(200, { ok: true, completed: false, reason: 'in_progress' });
    }

    let automatedTextSent = false;
    let leadRecordId: string | null = null;
    try {
      const progress = await getLeadDedupeRecord(threadId);
      const outreach = await runChatOutreach({
        progress,
        leaseId: lease.leaseId,
        threadId,
        reason,
        locale,
        pageUrl,
        chatUser: threadUser ?? chatUser,
        threadTitle,
        attachments,
        transcript: lines,
        leadSummary,
        attribution,
        customerPhone,
        customerPhoneE164,
        quoEnabled,
        quoApiKey: quoApiKey ?? null,
        quoFromPhoneNumberId: quoFromPhoneNumberId ?? null,
        quoUserId: quoUserId ?? null,
        leadToEmail,
        leadFromEmail,
        shopName: SHOP_NAME,
        shopPhoneDisplay: SHOP_PHONE_DISPLAY,
        shopPhoneDigits: SHOP_PHONE_DIGITS,
        shopAddress: SHOP_ADDRESS,
        leadEmailRawMessageMaxBytes: LEAD_EMAIL_RAW_MESSAGE_MAX_BYTES,
        nowEpochSeconds,
        createMessageLinkUrl: (linkArgs) =>
          createMessageLinkTokenUrl({
            messageLinkDb,
            messageLinkTokenTableName,
            threadId: linkArgs.threadId,
            kind: linkArgs.kind,
            toPhone: linkArgs.toPhone,
            body: linkArgs.body,
            baseUrl: linkArgs.baseUrl,
            ttlDays: MESSAGE_LINK_TOKEN_TTL_DAYS,
            nowEpochSeconds,
          }),
        ses,
      });
      automatedTextSent = outreach.automatedTextSent;

      try {
        leadRecordId = await persistCapturedChatLead({
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
          initialOutreach: outreach.initialOutreach,
          nowEpochSeconds,
          quoApiKey: quoApiKey ?? null,
          quoLeadTagsFieldKey: quoLeadTagsFieldKey ?? null,
          quoLeadTagsFieldName: quoLeadTagsFieldName ?? null,
          quoContactSource: quoContactSource ?? null,
          quoContactExternalIdPrefix: quoContactExternalIdPrefix ?? null,
        });
      } catch (err: unknown) {
        const { name, message } = getErrorDetails(err);
        console.error('Lead persistence failed', name, message);
      }

      await deleteLeadRetrySchedule(threadId);
    } catch (err: unknown) {
      const { message } = getErrorDetails(err);
      try {
        await markLeadHandoffError({
          threadId,
          leaseId: lease.leaseId,
          errorMessage: message ?? 'Failed to complete chat lead handoff',
        });
      } catch (markErr: unknown) {
        const { name, message: markMessage } = getErrorDetails(markErr);
        console.error('Lead dedupe mark error failed', name, markMessage);
      }
      throw err;
    }

    return jsonResponse(200, {
      ok: true,
      completed: true,
      reason,
      automated_text_sent: automatedTextSent,
      ...(leadRecordId ? { lead_record_id: leadRecordId } : {}),
    });
  } catch (err: unknown) {
    const { name, message } = getErrorDetails(err);
    console.error('Chat lead handoff failed', name, message);
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
    return jsonResponse(500, { error: 'Failed to complete chat lead handoff' });
  }
};
