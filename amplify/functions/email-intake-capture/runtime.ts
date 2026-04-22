import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import OpenAI from 'openai';
import { z } from 'zod';
import { createLeadPlatformRuntime } from '../_lead-platform/runtime.ts';
import { buildEmailLeadBundle } from '../_lead-platform/services/intake-email.ts';
import { upsertLeadBundle } from '../_lead-platform/services/persist.ts';
import { createOpenAiEmailLeadEvaluator } from './classification.ts';
import { createDynamoEmailIntakeLedger } from './ledger.ts';
import type { EmailIntakeDeps, PersistEmailLeadInput, S3EmailSource } from './types.ts';

const envSchema = z.object({
  CHATKIT_OPENAI_API_KEY: z.string().trim().optional(),
  CONTACT_SITE_LABEL: z.string().trim().min(1),
  EMAIL_INTAKE_GOOGLE_ROUTE_HEADER: z.string().trim().min(1),
  EMAIL_INTAKE_LEDGER_TABLE_NAME: z.string().trim().min(1),
  EMAIL_INTAKE_MODEL: z.string().trim().min(1),
  EMAIL_INTAKE_ORIGINAL_RECIPIENT: z.string().trim().email(),
  EMAIL_INTAKE_RECIPIENT: z.string().trim().email(),
  LEAD_FOLLOWUP_WORKER_FUNCTION_NAME: z.string().trim().min(1),
  SHOP_ADDRESS: z.string().trim().min(1),
  SHOP_NAME: z.string().trim().min(1),
  SHOP_PHONE_DISPLAY: z.string().trim().min(1),
});

async function streamToBuffer(source: S3EmailSource, s3: S3Client | null): Promise<Buffer> {
  if (!s3) throw new Error('S3 is not configured');
  const result = await s3.send(
    new GetObjectCommand({
      Bucket: source.bucket,
      Key: source.key,
    }),
  );
  const bytes = await result.Body?.transformToByteArray();
  if (!bytes) throw new Error('Inbound email S3 object was empty');
  return Buffer.from(bytes);
}

function createPersistEmailLead(args: {
  leadPlatformRuntime: ReturnType<typeof createLeadPlatformRuntime>;
  siteLabel: string;
}) {
  return async (input: PersistEmailLeadInput) => {
    const repos = args.leadPlatformRuntime.repos;
    if (!repos) return null;
    const bundle = buildEmailLeadBundle({
      customerLanguage: input.customerLanguage,
      customerMessage: input.customerMessage,
      email: input.customerEmail,
      emailIntakeId: input.emailIntakeId,
      messageId: input.messageId,
      missingInfo: input.missingInfo,
      leadSummary: input.leadSummary,
      name: input.customerName,
      occurredAt: Date.now(),
      originalRecipient: input.originalRecipient,
      phone: input.customerPhone,
      photoAttachmentCount: input.photoAttachmentCount,
      projectSummary: input.projectSummary,
      routeStatus: input.routeStatus,
      service: input.service,
      siteLabel: args.siteLabel,
      subject: input.subject,
      threadKey: input.threadKey,
      unsupportedAttachmentCount: input.unsupportedAttachmentCount,
      vehicle: input.vehicle,
    });
    const persisted = await upsertLeadBundle(repos, bundle);
    return {
      contactId: persisted.contact?.contact_id ?? null,
      journeyId: persisted.journey.journey_id,
      leadRecordId: persisted.leadRecord?.lead_record_id ?? null,
    };
  };
}

export function createEmailIntakeRuntime(env: NodeJS.ProcessEnv = process.env): EmailIntakeDeps {
  const parsedEnv = envSchema.safeParse(env);
  const db = parsedEnv.success ? DynamoDBDocumentClient.from(new DynamoDBClient({})) : null;
  const s3 = parsedEnv.success ? new S3Client({}) : null;
  const lambda = parsedEnv.success ? new LambdaClient({}) : null;
  const leadPlatformRuntime = createLeadPlatformRuntime(env);
  const config = {
    googleRouteHeaderValue: parsedEnv.success
      ? parsedEnv.data.EMAIL_INTAKE_GOOGLE_ROUTE_HEADER
      : '',
    intakeRecipient: parsedEnv.success ? parsedEnv.data.EMAIL_INTAKE_RECIPIENT : '',
    model: parsedEnv.success ? parsedEnv.data.EMAIL_INTAKE_MODEL : '',
    originalRecipient: parsedEnv.success ? parsedEnv.data.EMAIL_INTAKE_ORIGINAL_RECIPIENT : '',
    shopAddress: parsedEnv.success ? parsedEnv.data.SHOP_ADDRESS : '',
    shopName: parsedEnv.success ? parsedEnv.data.SHOP_NAME : '',
    shopPhoneDisplay: parsedEnv.success ? parsedEnv.data.SHOP_PHONE_DISPLAY : '',
    siteLabel: parsedEnv.success ? parsedEnv.data.CONTACT_SITE_LABEL : '',
  };
  const openai =
    parsedEnv.success && parsedEnv.data.CHATKIT_OPENAI_API_KEY
      ? new OpenAI({ apiKey: parsedEnv.data.CHATKIT_OPENAI_API_KEY })
      : null;

  return {
    config,
    configValid:
      parsedEnv.success &&
      Boolean(db) &&
      Boolean(lambda) &&
      Boolean(s3) &&
      leadPlatformRuntime.configValid,
    deleteRawEmail: async (source) => {
      if (!s3) return;
      await s3.send(new DeleteObjectCommand({ Bucket: source.bucket, Key: source.key }));
    },
    evaluateLead: createOpenAiEmailLeadEvaluator({ config, openai }),
    getRawEmail: (source) => streamToBuffer(source, s3),
    invokeFollowup: async (idempotencyKey) => {
      if (!lambda || !parsedEnv.success) return;
      await lambda.send(
        new InvokeCommand({
          FunctionName: parsedEnv.data.LEAD_FOLLOWUP_WORKER_FUNCTION_NAME,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify({ idempotency_key: idempotencyKey })),
        }),
      );
    },
    ledger: createDynamoEmailIntakeLedger({
      db,
      tableName: parsedEnv.success ? parsedEnv.data.EMAIL_INTAKE_LEDGER_TABLE_NAME : '',
    }),
    nowEpochSeconds: () => Math.floor(Date.now() / 1000),
    persistEmailLead: createPersistEmailLead({
      leadPlatformRuntime,
      siteLabel: config.siteLabel,
    }),
    repos: leadPlatformRuntime.repos,
  };
}
