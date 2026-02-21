import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  SchedulerClient,
  UpdateScheduleCommand,
} from '@aws-sdk/client-scheduler';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { z } from 'zod';
import { decodeBody, emptyResponse, getHttpMethod, jsonResponse } from '../_shared/http.ts';
import { sendTranscriptEmail } from './email-delivery';
import { generateLeadSummary } from './lead-summary';
import type {
  LeadAttributionPayload,
  LeadAttributionRecord,
  LeadDedupeRecord,
  LeadDedupeStatus,
  LeadEmailRequest,
  LambdaEvent,
  LambdaResult,
  TranscriptLine,
} from './lead-types';
import { createMessageLinkUrl as createMessageLinkTokenUrl } from './message-link';
import { extractCustomerContact } from './text-utils';
import { buildTranscript } from './transcript';

const leadEmailEnvSchema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1),
});

const leadEmailPayloadSchema = z
  .object({
    threadId: z.string().optional(),
    locale: z.string().optional(),
    pageUrl: z.string().optional(),
    user: z.string().optional(),
    reason: z.string().optional(),
    attribution: z.unknown().optional(),
  })
  .passthrough();

const parsedLeadEmailEnv = leadEmailEnvSchema.safeParse(process.env);
const apiKey = parsedLeadEmailEnv.success ? parsedLeadEmailEnv.data.OPENAI_API_KEY : '';
const openai = apiKey ? new OpenAI({ apiKey }) : null;

const leadDedupeTableName = process.env.LEAD_DEDUPE_TABLE_NAME;
const leadDedupeDb =
  leadDedupeTableName && leadDedupeTableName.trim()
    ? DynamoDBDocumentClient.from(new DynamoDBClient({}))
    : null;

const leadAttributionTableName = process.env.LEAD_ATTRIBUTION_TABLE_NAME;
const leadAttributionDb =
  leadAttributionTableName && leadAttributionTableName.trim()
    ? DynamoDBDocumentClient.from(new DynamoDBClient({}))
    : null;

const messageLinkTokenTableName = process.env.MESSAGE_LINK_TOKEN_TABLE_NAME;
const messageLinkDb =
  messageLinkTokenTableName && messageLinkTokenTableName.trim()
    ? DynamoDBDocumentClient.from(new DynamoDBClient({}))
    : null;

const leadToEmail = process.env.LEAD_TO_EMAIL ?? 'leads@craigs.autos';
const leadFromEmail = process.env.LEAD_FROM_EMAIL ?? 'leads@craigs.autos';
const leadSummaryModel = process.env.LEAD_SUMMARY_MODEL ?? 'gpt-5.2-2025-12-11';
const leadRetrySchedulerRoleArn = process.env.LEAD_RETRY_SCHEDULER_ROLE_ARN ?? '';
const leadRetryScheduleGroupName = process.env.LEAD_RETRY_SCHEDULE_GROUP ?? 'default';
const SHOP_NAME = "Craig's Auto Upholstery";
const SHOP_PHONE_DISPLAY = '(408) 379-3820';
const SHOP_PHONE_DIGITS = '4083793820';
const SHOP_ADDRESS = '271 Bestor St, San Jose, CA 95112';

const ses = new SESv2Client({});
const scheduler = leadRetrySchedulerRoleArn ? new SchedulerClient({}) : null;

const LEAD_DEDUPE_LEASE_SECONDS = 120;
const LEAD_DEDUPE_ERROR_COOLDOWN_SECONDS = 60;
const LEAD_DEDUPE_TTL_DAYS = 30;
const LEAD_IDLE_DELAY_SECONDS = 300;
const LEAD_RETRY_GRACE_SECONDS = 5;
const LEAD_ATTRIBUTION_TTL_DAYS = 180;
const MESSAGE_LINK_TOKEN_TTL_DAYS = 7;
const LEAD_INLINE_ATTACHMENT_MAX_BYTES = 3_000_000;

function isValidThreadId(value: string): boolean {
  return value.startsWith('cthr_') && value.length > 'cthr_'.length;
}

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function ttlSecondsFromNow(days: number): number {
  return nowEpochSeconds() + days * 24 * 60 * 60;
}

function latestActivityEpochSeconds(lines: TranscriptLine[]): number | null {
  if (!lines.length) return null;
  let latest = 0;
  for (const line of lines) {
    const createdAt = Math.floor(line?.created_at ?? 0);
    if (createdAt > latest) latest = createdAt;
  }
  return latest > 0 ? latest : null;
}

function buildRetryScheduleName(threadId: string): string {
  const safeId = threadId.replace(/[^A-Za-z0-9_-]/g, '-');
  return `lead-retry-${safeId}`.slice(0, 64);
}

function atExpressionUtc(epochSeconds: number): string {
  const utc = new Date(epochSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, '');
  return `at(${utc})`;
}

async function upsertLeadRetrySchedule(args: {
  threadId: string;
  runAtEpochSeconds: number;
  functionArn: string;
  payload: LeadEmailRequest;
}): Promise<boolean> {
  if (!scheduler || !args.functionArn || !leadRetrySchedulerRoleArn) return false;

  const scheduleName = buildRetryScheduleName(args.threadId);
  const scheduleExpression = atExpressionUtc(args.runAtEpochSeconds);
  const input = JSON.stringify({
    ...args.payload,
    reason: 'server_retry',
  });

  const scheduleRequest = {
    Name: scheduleName,
    GroupName: leadRetryScheduleGroupName,
    FlexibleTimeWindow: { Mode: 'OFF' as const },
    ScheduleExpression: scheduleExpression,
    ScheduleExpressionTimezone: 'UTC',
    ActionAfterCompletion: 'DELETE' as const,
    Target: {
      Arn: args.functionArn,
      RoleArn: leadRetrySchedulerRoleArn,
      Input: input,
      RetryPolicy: {
        MaximumEventAgeInSeconds: 3600,
        MaximumRetryAttempts: 1,
      },
    },
  };

  try {
    await scheduler.send(new CreateScheduleCommand(scheduleRequest));
    return true;
  } catch (err: any) {
    if (err?.name !== 'ConflictException') {
      console.error('Lead retry schedule create failed', err?.name, err?.message);
      return false;
    }
  }

  try {
    await scheduler.send(
      new UpdateScheduleCommand({
        ...scheduleRequest,
        State: 'ENABLED',
      }),
    );
    return true;
  } catch (err: any) {
    console.error('Lead retry schedule update failed', err?.name, err?.message);
    return false;
  }
}

async function deleteLeadRetrySchedule(threadId: string): Promise<void> {
  if (!scheduler) return;
  const scheduleName = buildRetryScheduleName(threadId);
  try {
    await scheduler.send(
      new DeleteScheduleCommand({
        Name: scheduleName,
        GroupName: leadRetryScheduleGroupName,
      }),
    );
  } catch (err: any) {
    if (err?.name === 'ResourceNotFoundException') return;
    console.error('Lead retry schedule delete failed', err?.name, err?.message);
  }
}

function sanitizeLeadDedupeRecord(item: any): LeadDedupeRecord | null {
  if (!item || typeof item !== 'object') return null;
  const thread_id = typeof item.thread_id === 'string' ? item.thread_id : '';
  const status = item.status as LeadDedupeStatus;
  if (!thread_id) return null;
  if (status !== 'sending' && status !== 'sent' && status !== 'error') return null;
  return item as LeadDedupeRecord;
}

async function getLeadDedupeRecord(threadId: string): Promise<LeadDedupeRecord | null> {
  if (!leadDedupeDb || !leadDedupeTableName) return null;
  const result = await leadDedupeDb.send(
    new GetCommand({
      TableName: leadDedupeTableName,
      Key: { thread_id: threadId },
    }),
  );
  return sanitizeLeadDedupeRecord(result.Item);
}

async function acquireLeadSendLease(args: {
  threadId: string;
  reason: string;
}): Promise<
  { acquired: true; leaseId: string } | { acquired: false; record: LeadDedupeRecord | null }
> {
  if (!leadDedupeDb || !leadDedupeTableName) {
    // No table configured (e.g., local dev) => allow sending but without cross-device idempotency.
    return { acquired: true, leaseId: randomUUID() };
  }

  const now = nowEpochSeconds();
  const leaseId = randomUUID();
  const ttl = ttlSecondsFromNow(LEAD_DEDUPE_TTL_DAYS);

  try {
    await leadDedupeDb.send(
      new UpdateCommand({
        TableName: leadDedupeTableName,
        Key: { thread_id: args.threadId },
        UpdateExpression:
          'SET #status = :sending, #lease_id = :lease_id, #lock_expires_at = :lock_expires_at, #updated_at = :now, #created_at = if_not_exists(#created_at, :now), #last_reason = :reason, #ttl = :ttl, #attempts = if_not_exists(#attempts, :zero) + :one',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#lease_id': 'lease_id',
          '#lock_expires_at': 'lock_expires_at',
          '#created_at': 'created_at',
          '#updated_at': 'updated_at',
          '#last_reason': 'last_reason',
          '#ttl': 'ttl',
          '#attempts': 'attempts',
        },
        ExpressionAttributeValues: {
          ':sending': 'sending',
          ':sent': 'sent',
          ':lease_id': leaseId,
          ':lock_expires_at': now + LEAD_DEDUPE_LEASE_SECONDS,
          ':now': now,
          ':reason': args.reason,
          ':ttl': ttl,
          ':zero': 0,
          ':one': 1,
        },
        ConditionExpression:
          'attribute_not_exists(thread_id) OR (#status <> :sent AND (attribute_not_exists(#lock_expires_at) OR #lock_expires_at < :now))',
      }),
    );
    return { acquired: true, leaseId };
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      const record = await getLeadDedupeRecord(args.threadId);
      return { acquired: false, record };
    }
    throw err;
  }
}

async function markLeadSent(args: {
  threadId: string;
  leaseId: string;
  messageId?: string | null;
}) {
  if (!leadDedupeDb || !leadDedupeTableName) return;
  const now = nowEpochSeconds();
  const ttl = ttlSecondsFromNow(LEAD_DEDUPE_TTL_DAYS);
  await leadDedupeDb.send(
    new UpdateCommand({
      TableName: leadDedupeTableName,
      Key: { thread_id: args.threadId },
      UpdateExpression:
        'SET #status = :sent, #sent_at = :now, #updated_at = :now, #ttl = :ttl' +
        (args.messageId ? ', #message_id = :message_id' : '') +
        ' REMOVE #lease_id, #last_error',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#sent_at': 'sent_at',
        '#updated_at': 'updated_at',
        '#lease_id': 'lease_id',
        '#last_error': 'last_error',
        '#ttl': 'ttl',
        '#message_id': 'message_id',
      },
      ExpressionAttributeValues: {
        ':sent': 'sent',
        ':now': now,
        ':ttl': ttl,
        ...(args.messageId ? { ':message_id': args.messageId } : {}),
        ':lease_id': args.leaseId,
      },
      ConditionExpression: '#lease_id = :lease_id',
    }),
  );
}

async function markLeadError(args: { threadId: string; leaseId: string; errorMessage: string }) {
  if (!leadDedupeDb || !leadDedupeTableName) return;
  const now = nowEpochSeconds();
  const ttl = ttlSecondsFromNow(LEAD_DEDUPE_TTL_DAYS);
  await leadDedupeDb.send(
    new UpdateCommand({
      TableName: leadDedupeTableName,
      Key: { thread_id: args.threadId },
      UpdateExpression:
        'SET #status = :error, #updated_at = :now, #lock_expires_at = :lock_expires_at, #last_error = :last_error, #ttl = :ttl REMOVE #lease_id',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updated_at': 'updated_at',
        '#lock_expires_at': 'lock_expires_at',
        '#last_error': 'last_error',
        '#ttl': 'ttl',
        '#lease_id': 'lease_id',
      },
      ExpressionAttributeValues: {
        ':error': 'error',
        ':now': now,
        ':lock_expires_at': now + LEAD_DEDUPE_ERROR_COOLDOWN_SECONDS,
        ':last_error': args.errorMessage.slice(0, 500),
        ':ttl': ttl,
        ':lease_id': args.leaseId,
      },
      ConditionExpression: '#lease_id = :lease_id',
    }),
  );
}

async function storeLeadAttribution(args: {
  threadId: string;
  locale: string;
  pageUrl: string;
  chatUser: string;
  reason: string;
  attribution: LeadAttributionPayload | null;
  customerPhone: string | null;
  customerEmail: string | null;
}): Promise<string | null> {
  if (!leadAttributionDb || !leadAttributionTableName) return null;
  const now = nowEpochSeconds();
  const leadId = randomUUID();
  const ttl = ttlSecondsFromNow(LEAD_ATTRIBUTION_TTL_DAYS);

  const record: LeadAttributionRecord = {
    lead_id: leadId,
    thread_id: args.threadId,
    created_at: now,
    lead_method: 'chat',
    lead_reason: args.reason,
    locale: args.locale || null,
    page_url: args.pageUrl || null,
    user_id: args.chatUser || null,
    qualified: false,
    qualified_at: null,
    uploaded: false,
    uploaded_at: null,
    device_type: args.attribution?.device_type ?? null,
    gclid: args.attribution?.gclid ?? null,
    gbraid: args.attribution?.gbraid ?? null,
    wbraid: args.attribution?.wbraid ?? null,
    utm_source: args.attribution?.utm_source ?? null,
    utm_medium: args.attribution?.utm_medium ?? null,
    utm_campaign: args.attribution?.utm_campaign ?? null,
    utm_term: args.attribution?.utm_term ?? null,
    utm_content: args.attribution?.utm_content ?? null,
    first_touch_ts: args.attribution?.first_touch_ts ?? null,
    last_touch_ts: args.attribution?.last_touch_ts ?? null,
    landing_page: args.attribution?.landing_page ?? null,
    referrer: args.attribution?.referrer ?? null,
    customer_phone: args.customerPhone,
    customer_email: args.customerEmail,
    ttl,
  };

  await leadAttributionDb.send(
    new PutCommand({
      TableName: leadAttributionTableName,
      Item: record,
    }),
  );
  return leadId;
}

function normalizeAttributionValue(value: unknown, maxLen = 256): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen);
}

function normalizeDeviceType(value: unknown): 'mobile' | 'desktop' | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'mobile' || normalized === 'desktop') return normalized;
  return null;
}

function sanitizeAttribution(input: any): LeadAttributionPayload | null {
  if (!input || typeof input !== 'object') return null;
  const payload: LeadAttributionPayload = {
    gclid: normalizeAttributionValue(input.gclid, 128),
    gbraid: normalizeAttributionValue(input.gbraid, 128),
    wbraid: normalizeAttributionValue(input.wbraid, 128),
    utm_source: normalizeAttributionValue(input.utm_source, 128),
    utm_medium: normalizeAttributionValue(input.utm_medium, 128),
    utm_campaign: normalizeAttributionValue(input.utm_campaign, 200),
    utm_term: normalizeAttributionValue(input.utm_term, 200),
    utm_content: normalizeAttributionValue(input.utm_content, 200),
    first_touch_ts: normalizeAttributionValue(input.first_touch_ts, 64),
    last_touch_ts: normalizeAttributionValue(input.last_touch_ts, 64),
    landing_page: normalizeAttributionValue(input.landing_page, 300),
    referrer: normalizeAttributionValue(input.referrer, 300),
    device_type: normalizeDeviceType(input.device_type),
  };

  const hasAny = Object.values(payload).some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
  return hasAny ? payload : null;
}

export const handler = async (
  event: LambdaEvent | LeadEmailRequest,
  context?: { invokedFunctionArn?: string },
): Promise<LambdaResult> => {
  const httpEvent = event as LambdaEvent;
  const method = getHttpMethod(httpEvent);
  const isHttpRequest = typeof method === 'string' && method.length > 0;

  if (isHttpRequest && method === 'OPTIONS') {
    // Lambda Function URL CORS handles the browser preflight automatically.
    return emptyResponse(204);
  }

  if (isHttpRequest && method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (!openai) {
    return jsonResponse(500, { error: 'Server missing configuration' });
  }

  let payload: LeadEmailRequest = {};
  if (isHttpRequest) {
    try {
      const body = decodeBody(httpEvent);
      const parsed = body ? JSON.parse(body) : {};
      const result = leadEmailPayloadSchema.safeParse(
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
    const result = leadEmailPayloadSchema.safeParse(event);
    if (!result.success) {
      return jsonResponse(400, { error: 'Invalid request payload' });
    }
    payload = result.data;
  }

  const threadId = typeof payload.threadId === 'string' ? payload.threadId : '';
  if (!threadId || !isValidThreadId(threadId)) {
    return jsonResponse(400, { error: 'Missing or invalid threadId' });
  }

  const locale = typeof payload.locale === 'string' ? payload.locale : '';
  const pageUrl = typeof payload.pageUrl === 'string' ? payload.pageUrl : '';
  const chatUser = typeof payload.user === 'string' ? payload.user : 'anonymous';
  const reason = typeof payload.reason === 'string' ? payload.reason : 'auto';
  const attribution = sanitizeAttribution((payload as any)?.attribution);
  const functionArn =
    typeof context?.invokedFunctionArn === 'string' ? context.invokedFunctionArn : '';

  try {
    // Fast path: if we've already emailed this thread, don't re-fetch transcript or re-run summaries.
    const now = nowEpochSeconds();
    if (leadDedupeDb && leadDedupeTableName) {
      try {
        const record = await getLeadDedupeRecord(threadId);
        if (record?.status === 'sent') {
          return jsonResponse(200, {
            ok: true,
            sent: true,
            reason: 'already_sent',
            sent_at: record.sent_at ?? null,
          });
        }
        const lockExpiresAt =
          typeof record?.lock_expires_at === 'number' ? record.lock_expires_at : 0;
        if (record?.status === 'sending' && lockExpiresAt > now) {
          return jsonResponse(200, { ok: true, sent: false, reason: 'in_progress' });
        }
        if (record?.status === 'error' && lockExpiresAt > now) {
          return jsonResponse(200, { ok: true, sent: false, reason: 'cooldown' });
        }
      } catch (err: any) {
        console.error('Lead dedupe read failed', err?.name, err?.message);
      }
    }

    const { threadTitle, threadUser, lines } = await buildTranscript({
      openai,
      threadId,
      assistantName: 'Roxana',
    });

    // Avoid sending empty transcripts (e.g., user opened chat but never messaged).
    const hasCustomerMessage = lines.some((line) => line.speaker === 'Customer');
    if (!hasCustomerMessage) {
      return jsonResponse(200, { ok: true, sent: false, reason: 'empty_thread' });
    }

    const detectedContact = extractCustomerContact(lines, SHOP_PHONE_DIGITS);
    if (!detectedContact.email && !detectedContact.phone) {
      // Lead intake without a way to contact the customer is not actionable.
      return jsonResponse(200, { ok: true, sent: false, reason: 'missing_contact' });
    }

    const lastMessageAt = latestActivityEpochSeconds(lines);
    const currentEpoch = nowEpochSeconds();
    if (lastMessageAt !== null && currentEpoch - lastMessageAt < LEAD_IDLE_DELAY_SECONDS) {
      const scheduledFor = Math.max(
        lastMessageAt + LEAD_IDLE_DELAY_SECONDS + LEAD_RETRY_GRACE_SECONDS,
        currentEpoch + LEAD_RETRY_GRACE_SECONDS,
      );
      const retryScheduled = await upsertLeadRetrySchedule({
        threadId,
        runAtEpochSeconds: scheduledFor,
        functionArn,
        payload: {
          threadId,
          locale,
          pageUrl,
          user: threadUser ?? chatUser,
          reason: 'server_retry',
          attribution,
        },
      });
      return jsonResponse(200, {
        ok: true,
        sent: false,
        reason: 'not_idle',
        last_activity_at: lastMessageAt,
        idle_seconds: LEAD_IDLE_DELAY_SECONDS,
        seconds_since_last_activity: currentEpoch - lastMessageAt,
        retry_scheduled: retryScheduled,
        scheduled_for: scheduledFor,
      });
    }

    const leadSummary = await generateLeadSummary({
      openai,
      leadSummaryModel,
      locale,
      pageUrl,
      transcript: lines,
      shopName: SHOP_NAME,
      shopPhoneDisplay: SHOP_PHONE_DISPLAY,
    });

    const shouldSendNow =
      // All completion paths should meet a minimum quality bar before sending.
      // This prevents premature lead emails from short pauses, explicit closes,
      // or pagehide events from firing incomplete summaries.
      leadSummary?.handoff_ready === true;

    if (!shouldSendNow) {
      return jsonResponse(200, {
        ok: true,
        sent: false,
        reason: leadSummary?.handoff_reason || 'not_ready',
        missing_info: leadSummary?.missing_info ?? [],
      });
    }

    // If the model failed to extract contact details, fall back to simple detection from the transcript.
    const hydratedLeadSummary =
      leadSummary && (!leadSummary.customer_email || !leadSummary.customer_phone)
        ? {
            ...leadSummary,
            customer_email: leadSummary.customer_email ?? detectedContact.email,
            customer_phone: leadSummary.customer_phone ?? detectedContact.phone,
          }
        : leadSummary;

    // Acquire a per-thread lease before sending so we never email the shop twice for the same thread,
    // even if multiple devices or tab lifecycle events trigger this endpoint concurrently.
    const lease = await acquireLeadSendLease({ threadId, reason });
    if (!lease.acquired) {
      if (lease.record?.status === 'sent') {
        return jsonResponse(200, {
          ok: true,
          sent: true,
          reason: 'already_sent',
          sent_at: lease.record.sent_at ?? null,
        });
      }
      const lockExpiresAt =
        typeof lease.record?.lock_expires_at === 'number' ? lease.record.lock_expires_at : 0;
      if (lease.record?.status === 'error' && lockExpiresAt > nowEpochSeconds()) {
        return jsonResponse(200, { ok: true, sent: false, reason: 'cooldown' });
      }
      return jsonResponse(200, { ok: true, sent: false, reason: 'in_progress' });
    }

    try {
      const messageId = await sendTranscriptEmail({
        ses,
        leadToEmail,
        leadFromEmail,
        threadId,
        locale,
        pageUrl,
        chatUser: threadUser ?? chatUser,
        reason,
        threadTitle,
        transcript: lines,
        leadSummary: hydratedLeadSummary,
        attribution,
        shopName: SHOP_NAME,
        shopPhoneDisplay: SHOP_PHONE_DISPLAY,
        shopPhoneDigits: SHOP_PHONE_DIGITS,
        shopAddress: SHOP_ADDRESS,
        leadInlineAttachmentMaxBytes: LEAD_INLINE_ATTACHMENT_MAX_BYTES,
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
      });
      try {
        await markLeadSent({ threadId, leaseId: lease.leaseId, messageId });
      } catch (err: any) {
        console.error('Lead dedupe mark sent failed', err?.name, err?.message);
      }

      try {
        const detectedContact = extractCustomerContact(lines, SHOP_PHONE_DIGITS);
        const customerPhone = hydratedLeadSummary?.customer_phone ?? detectedContact.phone ?? null;
        const customerEmail = hydratedLeadSummary?.customer_email ?? detectedContact.email ?? null;
        await storeLeadAttribution({
          threadId,
          locale,
          pageUrl,
          chatUser: threadUser ?? chatUser,
          reason,
          attribution,
          customerPhone,
          customerEmail,
        });
      } catch (err: any) {
        console.error('Lead attribution write failed', err?.name, err?.message);
      }

      await deleteLeadRetrySchedule(threadId);
    } catch (err: any) {
      try {
        await markLeadError({
          threadId,
          leaseId: lease.leaseId,
          errorMessage: String(err?.message ?? err ?? 'Failed to send lead email'),
        });
      } catch (markErr: any) {
        console.error('Lead dedupe mark error failed', markErr?.name, markErr?.message);
      }
      throw err;
    }

    return jsonResponse(200, { ok: true, sent: true, reason });
  } catch (err: any) {
    console.error('Lead email failed', err?.name, err?.message);
    return jsonResponse(500, { error: 'Failed to send lead email' });
  }
};
