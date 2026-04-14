import { randomUUID } from 'node:crypto';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { asObject, getErrorDetails } from '../_shared/safe.ts';
import type { LeadDedupeRecord, LeadDedupeStatus } from './lead-types.ts';
import {
  LEAD_DEDUPE_ERROR_COOLDOWN_SECONDS,
  LEAD_DEDUPE_LEASE_SECONDS,
  LEAD_DEDUPE_TTL_DAYS,
  leadDedupeDb,
  leadDedupeTableName,
  nowEpochSeconds,
  ttlSecondsFromNow,
} from './runtime.ts';

function sanitizeLeadDedupeRecord(item: unknown): LeadDedupeRecord | null {
  const record = asObject(item);
  if (!record) return null;
  const thread_id = typeof record.thread_id === 'string' ? record.thread_id : '';
  const status = record.status as LeadDedupeStatus;
  if (!thread_id) return null;
  if (status !== 'sending' && status !== 'sent' && status !== 'error') return null;
  return record as LeadDedupeRecord;
}

export async function getLeadDedupeRecord(threadId: string): Promise<LeadDedupeRecord | null> {
  if (!leadDedupeDb || !leadDedupeTableName) return null;
  const result = await leadDedupeDb.send(
    new GetCommand({
      TableName: leadDedupeTableName,
      Key: { thread_id: threadId },
    }),
  );
  return sanitizeLeadDedupeRecord(result.Item);
}

export async function acquireLeadSendLease(args: {
  threadId: string;
  reason: string;
}): Promise<
  { acquired: true; leaseId: string } | { acquired: false; record: LeadDedupeRecord | null }
> {
  if (!leadDedupeDb || !leadDedupeTableName) {
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
  } catch (err: unknown) {
    const { name } = getErrorDetails(err);
    if (name === 'ConditionalCheckFailedException') {
      const record = await getLeadDedupeRecord(args.threadId);
      return { acquired: false, record };
    }
    throw err;
  }
}

export async function markLeadEmailSent(args: {
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
        'SET #email_sent_at = :now, #updated_at = :now, #ttl = :ttl' +
        (args.messageId ? ', #email_message_id = :message_id, #message_id = :message_id' : ''),
      ExpressionAttributeNames: {
        '#email_sent_at': 'email_sent_at',
        '#email_message_id': 'email_message_id',
        '#lease_id': 'lease_id',
        '#message_id': 'message_id',
        '#updated_at': 'updated_at',
        '#ttl': 'ttl',
      },
      ExpressionAttributeValues: {
        ':now': now,
        ':ttl': ttl,
        ...(args.messageId ? { ':message_id': args.messageId } : {}),
        ':lease_id': args.leaseId,
      },
      ConditionExpression: '#lease_id = :lease_id',
    }),
  );
}

export async function markLeadQuoSent(args: {
  threadId: string;
  leaseId: string;
  messageId: string;
}) {
  if (!leadDedupeDb || !leadDedupeTableName) return;
  const now = nowEpochSeconds();
  const ttl = ttlSecondsFromNow(LEAD_DEDUPE_TTL_DAYS);
  await leadDedupeDb.send(
    new UpdateCommand({
      TableName: leadDedupeTableName,
      Key: { thread_id: args.threadId },
      UpdateExpression:
        'SET #quo_sent_at = :now, #quo_message_id = :message_id, #updated_at = :now, #ttl = :ttl REMOVE #quo_last_error',
      ExpressionAttributeNames: {
        '#quo_sent_at': 'quo_sent_at',
        '#quo_message_id': 'quo_message_id',
        '#quo_last_error': 'quo_last_error',
        '#updated_at': 'updated_at',
        '#ttl': 'ttl',
        '#lease_id': 'lease_id',
      },
      ExpressionAttributeValues: {
        ':now': now,
        ':ttl': ttl,
        ':message_id': args.messageId,
        ':lease_id': args.leaseId,
      },
      ConditionExpression: '#lease_id = :lease_id',
    }),
  );
}

export async function markLeadQuoError(args: {
  threadId: string;
  leaseId: string;
  errorMessage: string;
}) {
  if (!leadDedupeDb || !leadDedupeTableName) return;
  const now = nowEpochSeconds();
  const ttl = ttlSecondsFromNow(LEAD_DEDUPE_TTL_DAYS);
  await leadDedupeDb.send(
    new UpdateCommand({
      TableName: leadDedupeTableName,
      Key: { thread_id: args.threadId },
      UpdateExpression:
        'SET #quo_last_error = :quo_last_error, #updated_at = :now, #ttl = :ttl',
      ExpressionAttributeNames: {
        '#quo_last_error': 'quo_last_error',
        '#updated_at': 'updated_at',
        '#ttl': 'ttl',
        '#lease_id': 'lease_id',
      },
      ExpressionAttributeValues: {
        ':quo_last_error': args.errorMessage.slice(0, 500),
        ':now': now,
        ':ttl': ttl,
        ':lease_id': args.leaseId,
      },
      ConditionExpression: '#lease_id = :lease_id',
    }),
  );
}

export async function markLeadSent(args: { threadId: string; leaseId: string }) {
  if (!leadDedupeDb || !leadDedupeTableName) return;
  const now = nowEpochSeconds();
  const ttl = ttlSecondsFromNow(LEAD_DEDUPE_TTL_DAYS);
  await leadDedupeDb.send(
    new UpdateCommand({
      TableName: leadDedupeTableName,
      Key: { thread_id: args.threadId },
      UpdateExpression:
        'SET #status = :sent, #sent_at = :now, #updated_at = :now, #ttl = :ttl REMOVE #lease_id, #last_error',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#sent_at': 'sent_at',
        '#updated_at': 'updated_at',
        '#lease_id': 'lease_id',
        '#last_error': 'last_error',
        '#ttl': 'ttl',
      },
      ExpressionAttributeValues: {
        ':sent': 'sent',
        ':now': now,
        ':ttl': ttl,
        ':lease_id': args.leaseId,
      },
      ConditionExpression: '#lease_id = :lease_id',
    }),
  );
}

export async function markLeadError(args: {
  threadId: string;
  leaseId: string;
  errorMessage: string;
}) {
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
