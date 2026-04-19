import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { QuoteRequestRecord } from '../_lead-platform/domain/quote-request.ts';
import { createLeadPlatformRuntime } from '../_lead-platform/runtime.ts';
import { persistQuoteRequestLeadIntake } from '../_lead-platform/services/quote-request.ts';
import type { SubmitQuoteRequestDeps } from './submit-quote-request.ts';

const envSchema = z.object({
  CONTACT_SITE_LABEL: z.string().trim().min(1),
  QUOTE_REQUESTS_TABLE_NAME: z.string().trim().min(1),
  LEAD_FOLLOWUP_WORKER_FUNCTION_NAME: z.string().trim().min(1),
});

export function createQuoteRequestSubmitRuntime(
  env: NodeJS.ProcessEnv = process.env,
): SubmitQuoteRequestDeps {
  const parsedEnv = envSchema.safeParse(env);
  const lambda = parsedEnv.success ? new LambdaClient({}) : null;
  const db = parsedEnv.success ? DynamoDBDocumentClient.from(new DynamoDBClient({})) : null;
  const leadPlatformRuntime = createLeadPlatformRuntime(env);

  return {
    configValid:
      parsedEnv.success && Boolean(lambda) && Boolean(db) && leadPlatformRuntime.configValid,
    createQuoteRequestId: () => randomUUID(),
    nowEpochSeconds: () => Math.floor(Date.now() / 1000),
    siteLabel: parsedEnv.success ? parsedEnv.data.CONTACT_SITE_LABEL : '',
    persistQuoteRequest: async (input) => {
      const repos = leadPlatformRuntime.repos;
      if (!repos) return null;
      return persistQuoteRequestLeadIntake({ repos, input });
    },
    queueQuoteRequest: async (record: QuoteRequestRecord) => {
      if (!db || !parsedEnv.success) return;
      await db.send(
        new PutCommand({
          TableName: parsedEnv.data.QUOTE_REQUESTS_TABLE_NAME,
          Item: record,
        }),
      );
    },
    invokeFollowup: async (quoteRequestId: string) => {
      if (!lambda || !parsedEnv.success) return;
      await lambda.send(
        new InvokeCommand({
          FunctionName: parsedEnv.data.LEAD_FOLLOWUP_WORKER_FUNCTION_NAME,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify({ quote_request_id: quoteRequestId })),
        }),
      );
    },
  };
}
