import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createLeadPlatformRuntime } from '../_lead-platform/runtime.ts';
import { generateLeadFollowupDrafts } from './drafts.ts';
import { createSesCustomerEmailSender } from './customer-email.ts';
import { createLeadPhotoAttachmentLoader } from './lead-attachments.ts';
import { createLeadFollowupWorkerLeadSync } from './lead-sync.ts';
import { createSesOwnerEmailSender } from './owner-email.ts';
import { createQuoSmsSender } from './quo-sms.ts';
import { createDynamoLeadFollowupWorkStore } from './followup-work-store.ts';
import type { LeadFollowupWorkerDeps } from './types.ts';

const leadFollowupWorkerEnvSchema = z.object({
  LEAD_FOLLOWUP_WORK_TABLE_NAME: z.string().trim().min(1),
  CONTACT_FROM_EMAIL: z.string().trim().email(),
  CONTACT_TO_EMAIL: z.string().trim().email(),
  CONTACT_SITE_LABEL: z.string().trim().min(1),
  EMAIL_CUSTOMER_FROM_EMAIL: z.string().trim().email(),
  EMAIL_CUSTOMER_REPLY_TO_EMAIL: z.string().trim().email(),
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

export function createLeadFollowupWorkerRuntime(
  env: NodeJS.ProcessEnv = process.env,
): LeadFollowupWorkerDeps {
  const parsedEnv = leadFollowupWorkerEnvSchema.safeParse(env);
  const runtimeDb = parsedEnv.success ? DynamoDBDocumentClient.from(new DynamoDBClient({})) : null;
  const runtimeSes = parsedEnv.success ? new SESv2Client({}) : null;
  const runtimeS3 = parsedEnv.success ? new S3Client({}) : null;
  const leadPlatformRuntime = createLeadPlatformRuntime(env);
  const runtimeOpenAi =
    parsedEnv.success && parsedEnv.data.CHATKIT_OPENAI_API_KEY
      ? new OpenAI({ apiKey: parsedEnv.data.CHATKIT_OPENAI_API_KEY })
      : null;
  const quoEnabled = parsedEnv.success && parsedEnv.data.QUO_ENABLED === 'true';
  const loadLeadPhotos = createLeadPhotoAttachmentLoader({ s3: runtimeS3 });
  const followupWorkStore = createDynamoLeadFollowupWorkStore({
    db: runtimeDb,
    tableName: parsedEnv.success ? parsedEnv.data.LEAD_FOLLOWUP_WORK_TABLE_NAME : '',
  });

  return {
    ...followupWorkStore,
    configValid:
      parsedEnv.success &&
      Boolean(runtimeDb) &&
      Boolean(runtimeSes) &&
      leadPlatformRuntime.configValid,
    createLeaseId: () => randomUUID(),
    smsAutomationEnabled: quoEnabled,
    nowEpochSeconds: () => Math.floor(Date.now() / 1000),
    generateDrafts: async (record) =>
      generateLeadFollowupDrafts({
        openai: runtimeOpenAi,
        model: parsedEnv.success ? parsedEnv.data.QUOTE_OUTREACH_MODEL : '',
        photos: await loadLeadPhotos(record),
        record,
        shopAddress: parsedEnv.success ? parsedEnv.data.SHOP_ADDRESS : '',
        shopName: parsedEnv.success ? parsedEnv.data.SHOP_NAME : '',
        shopPhoneDigits: parsedEnv.success ? parsedEnv.data.SHOP_PHONE_DIGITS : '',
        shopPhoneDisplay: parsedEnv.success ? parsedEnv.data.SHOP_PHONE_DISPLAY : '',
      }),
    sendSms: createQuoSmsSender({
      apiKey: parsedEnv.success ? (parsedEnv.data.QUO_API_KEY ?? '') : '',
      enabled: quoEnabled,
      fromPhoneNumberId: parsedEnv.success ? (parsedEnv.data.QUO_FROM_PHONE_NUMBER_ID ?? '') : '',
      userId: parsedEnv.success ? (parsedEnv.data.QUO_USER_ID ?? null) : null,
    }),
    sendCustomerEmail: createSesCustomerEmailSender({
      bccEmail: parsedEnv.success ? parsedEnv.data.QUOTE_CUSTOMER_BCC_EMAIL : '',
      emailIntakeFromEmail: parsedEnv.success ? parsedEnv.data.EMAIL_CUSTOMER_FROM_EMAIL : '',
      emailIntakeReplyToEmail: parsedEnv.success
        ? parsedEnv.data.EMAIL_CUSTOMER_REPLY_TO_EMAIL
        : '',
      fromEmail: parsedEnv.success ? parsedEnv.data.QUOTE_CUSTOMER_FROM_EMAIL : '',
      replyToEmail: parsedEnv.success ? parsedEnv.data.QUOTE_CUSTOMER_REPLY_TO_EMAIL : '',
      ses: runtimeSes,
    }),
    sendOwnerEmail: createSesOwnerEmailSender({
      fromEmail: parsedEnv.success ? parsedEnv.data.CONTACT_FROM_EMAIL : '',
      loadAttachments: loadLeadPhotos,
      quoEnabled,
      ses: runtimeSes,
      toEmail: parsedEnv.success ? parsedEnv.data.CONTACT_TO_EMAIL : '',
    }),
    cleanupInboundEmailSource: async (record) => {
      if (!runtimeS3 || !record.inbound_email_s3_bucket || !record.inbound_email_s3_key) return;
      await runtimeS3.send(
        new DeleteObjectCommand({
          Bucket: record.inbound_email_s3_bucket,
          Key: record.inbound_email_s3_key,
        }),
      );
    },
    cleanupLeadAttachments: async (record) => {
      if (!runtimeS3) return;
      const formAttachmentKeys: Array<{ bucket: string; key: string }> = [];
      for (const attachment of record.attachments ?? []) {
        if (attachment.storage.kind === 's3') {
          formAttachmentKeys.push({
            bucket: attachment.storage.bucket,
            key: attachment.storage.key,
          });
        }
      }
      await Promise.all(
        formAttachmentKeys.map((attachment) =>
          runtimeS3.send(
            new DeleteObjectCommand({
              Bucket: attachment.bucket,
              Key: attachment.key,
            }),
          ),
        ),
      );
    },
    syncLeadRecord: createLeadFollowupWorkerLeadSync({
      externalIdPrefix: parsedEnv.success
        ? (parsedEnv.data.QUO_CONTACT_EXTERNAL_ID_PREFIX ?? '')
        : null,
      leadTagsFieldKey: parsedEnv.success ? (parsedEnv.data.QUO_LEAD_TAGS_FIELD_KEY ?? '') : null,
      leadTagsFieldName: parsedEnv.success ? (parsedEnv.data.QUO_LEAD_TAGS_FIELD_NAME ?? '') : null,
      quoApiKey: parsedEnv.success ? (parsedEnv.data.QUO_API_KEY ?? '') : '',
      repos: leadPlatformRuntime.repos,
      source: parsedEnv.success ? (parsedEnv.data.QUO_CONTACT_SOURCE ?? '') : null,
    }),
  };
}
