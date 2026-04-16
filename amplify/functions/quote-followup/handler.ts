import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createLeadCoreRuntime } from '../_lead-core/runtime.ts';
import type { QuoteSubmissionRecord } from '../_shared/quote-submissions.ts';
import { jsonResponse } from '../_shared/http.ts';
import { sendQuoTextMessage } from '../chatkit-lead-email/quo.ts';
import {
  buildCustomerEmailHtml,
  buildOwnerEmailContent,
  buildResultLabel,
} from './email-content.ts';
import { generateQuoteDrafts } from './drafts.ts';
import { applyQuoteFollowupToLeadRecord } from './lead-record-sync.ts';
import type { LambdaResult, QuoteFollowupDeps, QuoteFollowupEvent } from './types.ts';
import { runQuoteFollowupWorkflow } from './workflow.ts';

const QUOTE_LEASE_SECONDS = 5 * 60;

const quoteFollowupEnvSchema = z.object({
  QUOTE_SUBMISSIONS_TABLE_NAME: z.string().trim().min(1),
  CONTACT_FROM_EMAIL: z.string().trim().email(),
  CONTACT_TO_EMAIL: z.string().trim().email(),
  CONTACT_SITE_LABEL: z.string().trim().min(1),
  QUOTE_CUSTOMER_FROM_EMAIL: z.string().trim().email(),
  QUOTE_CUSTOMER_BCC_EMAIL: z.string().trim().email(),
  QUOTE_CUSTOMER_REPLY_TO_EMAIL: z.string().trim().email(),
  QUOTE_OUTREACH_MODEL: z.string().trim().min(1),
  SHOP_NAME: z.string().trim().min(1),
  SHOP_PHONE_DISPLAY: z.string().trim().min(1),
  SHOP_PHONE_DIGITS: z.string().trim().min(7),
  SHOP_ADDRESS: z.string().trim().min(1),
  QUO_ENABLED: z.string().trim().optional(),
  QUO_FROM_PHONE_NUMBER_ID: z.string().trim().optional(),
  QUO_USER_ID: z.string().trim().optional(),
  CHATKIT_OPENAI_API_KEY: z.string().trim().optional(),
  QUO_API_KEY: z.string().trim().optional(),
  QUO_CONTACT_SOURCE: z.string().trim().optional(),
  QUO_CONTACT_EXTERNAL_ID_PREFIX: z.string().trim().optional(),
  QUO_LEAD_TAGS_FIELD_KEY: z.string().trim().optional(),
  QUO_LEAD_TAGS_FIELD_NAME: z.string().trim().optional(),
});

function json(statusCode: number, body: unknown): LambdaResult {
  return jsonResponse(statusCode, body);
}

export function createQuoteFollowupHandler(deps: QuoteFollowupDeps) {
  return async (event: QuoteFollowupEvent): Promise<LambdaResult> => {
    if (!deps.configValid) {
      return json(500, { error: 'Server missing configuration' });
    }

    const submissionId = typeof event?.submission_id === 'string' ? event.submission_id.trim() : '';
    if (!submissionId) {
      return json(400, { error: 'Missing submission_id' });
    }

    const now = deps.nowEpochSeconds();
    const existing = await deps.getSubmission(submissionId);
    if (!existing) {
      return json(404, { error: 'Submission not found' });
    }
    if (existing.status === 'completed') {
      return json(200, { ok: true, skipped: true, reason: 'already_completed' });
    }
    if (existing.status === 'processing' && (existing.lock_expires_at ?? 0) > now) {
      return json(200, { ok: true, skipped: true, reason: 'in_progress' });
    }

    const leaseId = randomUUID();
    const leaseExpiresAt = now + QUOTE_LEASE_SECONDS;
    const leaseAcquired = await deps.acquireLease({
      submissionId,
      leaseId,
      nowEpoch: now,
      leaseExpiresAt,
    });
    if (!leaseAcquired) {
      return json(200, { ok: true, skipped: true, reason: 'lease_not_acquired' });
    }

    const record: QuoteSubmissionRecord = {
      ...existing,
      status: 'processing',
      lease_id: leaseId,
      lock_expires_at: leaseExpiresAt,
      updated_at: now,
    };

    const outcome = await runQuoteFollowupWorkflow({
      deps,
      record,
      submissionId,
    });

    if (deps.syncLeadRecord) {
      try {
        await deps.syncLeadRecord(record);
      } catch (error: unknown) {
        console.error('Failed to sync lead record from quote follow-up.', error);
      }
    }

    return json(outcome.statusCode, outcome.body);
  };
}

const parsedEnv = quoteFollowupEnvSchema.safeParse(process.env);
const runtimeDb = parsedEnv.success ? DynamoDBDocumentClient.from(new DynamoDBClient({})) : null;
const runtimeSes = parsedEnv.success ? new SESv2Client({}) : null;
const leadCoreRuntime = createLeadCoreRuntime(process.env);
const runtimeOpenAi =
  parsedEnv.success && parsedEnv.data.CHATKIT_OPENAI_API_KEY
    ? new OpenAI({ apiKey: parsedEnv.data.CHATKIT_OPENAI_API_KEY })
    : null;

export const handler = createQuoteFollowupHandler({
  configValid:
    parsedEnv.success && Boolean(runtimeDb) && Boolean(runtimeSes) && leadCoreRuntime.configValid,
  smsAutomationEnabled: parsedEnv.success && parsedEnv.data.QUO_ENABLED === 'true',
  nowEpochSeconds: () => Math.floor(Date.now() / 1000),
  getSubmission: async (submissionId: string) => {
    if (!runtimeDb || !parsedEnv.success) return null;
    const result = await runtimeDb.send(
      new GetCommand({
        TableName: parsedEnv.data.QUOTE_SUBMISSIONS_TABLE_NAME,
        Key: { submission_id: submissionId },
      }),
    );
    return (result.Item as QuoteSubmissionRecord | undefined) ?? null;
  },
  acquireLease: async ({ submissionId, leaseId, nowEpoch, leaseExpiresAt }) => {
    if (!runtimeDb || !parsedEnv.success) return false;
    try {
      await runtimeDb.send(
        new UpdateCommand({
          TableName: parsedEnv.data.QUOTE_SUBMISSIONS_TABLE_NAME,
          Key: { submission_id: submissionId },
          UpdateExpression:
            'SET #status = :processing, lease_id = :leaseId, lock_expires_at = :lockExpiresAt, updated_at = :updatedAt',
          ConditionExpression:
            'attribute_not_exists(lock_expires_at) OR lock_expires_at < :nowEpoch OR #status IN (:queued, :error)',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':processing': 'processing',
            ':leaseId': leaseId,
            ':lockExpiresAt': leaseExpiresAt,
            ':updatedAt': nowEpoch,
            ':nowEpoch': nowEpoch,
            ':queued': 'queued',
            ':error': 'error',
          },
        }),
      );
      return true;
    } catch (error: unknown) {
      if ((error as { name?: string } | null)?.name === 'ConditionalCheckFailedException') {
        return false;
      }
      throw error;
    }
  },
  saveSubmission: async (record: QuoteSubmissionRecord) => {
    if (!runtimeDb || !parsedEnv.success) return;
    await runtimeDb.send(
      new PutCommand({
        TableName: parsedEnv.data.QUOTE_SUBMISSIONS_TABLE_NAME,
        Item: record,
      }),
    );
  },
  generateDrafts: (record: QuoteSubmissionRecord) =>
    generateQuoteDrafts({
      openai: runtimeOpenAi,
      model: parsedEnv.success ? parsedEnv.data.QUOTE_OUTREACH_MODEL : '',
      record,
      shopAddress: parsedEnv.success ? parsedEnv.data.SHOP_ADDRESS : '',
      shopName: parsedEnv.success ? parsedEnv.data.SHOP_NAME : '',
      shopPhoneDigits: parsedEnv.success ? parsedEnv.data.SHOP_PHONE_DIGITS : '',
      shopPhoneDisplay: parsedEnv.success ? parsedEnv.data.SHOP_PHONE_DISPLAY : '',
    }),
  sendSms: async ({ toE164, body }) => {
    if (!parsedEnv.success || parsedEnv.data.QUO_ENABLED !== 'true') {
      throw new Error('QUO is not enabled');
    }
    if (!parsedEnv.data.QUO_API_KEY || !parsedEnv.data.QUO_FROM_PHONE_NUMBER_ID) {
      throw new Error('QUO is not configured');
    }
    return sendQuoTextMessage({
      apiKey: parsedEnv.data.QUO_API_KEY,
      fromPhoneNumberId: parsedEnv.data.QUO_FROM_PHONE_NUMBER_ID,
      toE164,
      content: body,
      userId: parsedEnv.data.QUO_USER_ID || null,
    });
  },
  sendCustomerEmail: async ({ to, subject, body }) => {
    if (!runtimeSes || !parsedEnv.success) {
      throw new Error('SES is not configured');
    }
    const result = await runtimeSes.send(
      new SendEmailCommand({
        FromEmailAddress: parsedEnv.data.QUOTE_CUSTOMER_FROM_EMAIL,
        Destination: {
          ToAddresses: [to],
          BccAddresses: [parsedEnv.data.QUOTE_CUSTOMER_BCC_EMAIL],
        },
        ReplyToAddresses: [parsedEnv.data.QUOTE_CUSTOMER_REPLY_TO_EMAIL],
        Content: {
          Simple: {
            Subject: {
              Charset: 'UTF-8',
              Data: subject,
            },
            Body: {
              Html: {
                Charset: 'UTF-8',
                Data: buildCustomerEmailHtml(body),
              },
              Text: {
                Charset: 'UTF-8',
                Data: body,
              },
            },
          },
        },
      }),
    );
    return { messageId: result.MessageId ?? '' };
  },
  sendOwnerEmail: async ({ record }) => {
    if (!runtimeSes || !parsedEnv.success) {
      throw new Error('SES is not configured');
    }
    const resultLabel = buildResultLabel(
      record.outreach_result,
      parsedEnv.data.QUO_ENABLED === 'true',
    );
    const message = buildOwnerEmailContent({ record, resultLabel });
    const result = await runtimeSes.send(
      new SendEmailCommand({
        FromEmailAddress: parsedEnv.data.CONTACT_FROM_EMAIL,
        Destination: {
          ToAddresses: [parsedEnv.data.CONTACT_TO_EMAIL],
        },
        Content: {
          Simple: {
            Subject: {
              Charset: 'UTF-8',
              Data: message.subject,
            },
            Body: {
              Html: {
                Charset: 'UTF-8',
                Data: message.html,
              },
              Text: {
                Charset: 'UTF-8',
                Data: message.text,
              },
            },
          },
        },
      }),
    );
    return { messageId: result.MessageId ?? '' };
  },
  syncLeadRecord: async (record) => {
    const repos = leadCoreRuntime.repos;
    if (!repos) return;
    await applyQuoteFollowupToLeadRecord({
      repos,
      record,
      quoConfig: {
        apiKey: parsedEnv.success ? (parsedEnv.data.QUO_API_KEY ?? '') : '',
        leadTagsFieldKey: parsedEnv.success ? (parsedEnv.data.QUO_LEAD_TAGS_FIELD_KEY ?? '') : null,
        leadTagsFieldName: parsedEnv.success
          ? (parsedEnv.data.QUO_LEAD_TAGS_FIELD_NAME ?? '')
          : null,
        source: parsedEnv.success ? (parsedEnv.data.QUO_CONTACT_SOURCE ?? '') : null,
        externalIdPrefix: parsedEnv.success
          ? (parsedEnv.data.QUO_CONTACT_EXTERNAL_ID_PREFIX ?? '')
          : null,
      },
    });
  },
});
