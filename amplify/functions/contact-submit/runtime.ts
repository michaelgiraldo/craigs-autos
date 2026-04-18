import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { QuoteSubmissionRecord } from '../_lead-core/domain/quote-request.ts';
import { createLeadCoreRuntime } from '../_lead-core/runtime.ts';
import { persistQuoteRequestLeadIntake } from '../_lead-core/services/quote-request.ts';
import type { SubmitQuoteRequestDeps } from './submit-quote-request.ts';

const envSchema = z.object({
  CONTACT_SITE_LABEL: z.string().trim().min(1),
  QUOTE_SUBMISSIONS_TABLE_NAME: z.string().trim().min(1),
  QUOTE_FOLLOWUP_FUNCTION_NAME: z.string().trim().min(1),
});

export function createContactSubmitRuntime(
  env: NodeJS.ProcessEnv = process.env,
): SubmitQuoteRequestDeps {
  const parsedEnv = envSchema.safeParse(env);
  const lambda = parsedEnv.success ? new LambdaClient({}) : null;
  const db = parsedEnv.success ? DynamoDBDocumentClient.from(new DynamoDBClient({})) : null;
  const leadCoreRuntime = createLeadCoreRuntime(env);

  return {
    configValid: parsedEnv.success && Boolean(lambda) && Boolean(db) && leadCoreRuntime.configValid,
    createSubmissionId: () => randomUUID(),
    nowEpochSeconds: () => Math.floor(Date.now() / 1000),
    siteLabel: parsedEnv.success ? parsedEnv.data.CONTACT_SITE_LABEL : '',
    persistQuoteRequest: async (input) => {
      const repos = leadCoreRuntime.repos;
      if (!repos) return null;
      return persistQuoteRequestLeadIntake({ repos, input });
    },
    queueSubmission: async (record: QuoteSubmissionRecord) => {
      if (!db || !parsedEnv.success) return;
      await db.send(
        new PutCommand({
          TableName: parsedEnv.data.QUOTE_SUBMISSIONS_TABLE_NAME,
          Item: record,
        }),
      );
    },
    invokeFollowup: async (submissionId: string) => {
      if (!lambda || !parsedEnv.success) return;
      await lambda.send(
        new InvokeCommand({
          FunctionName: parsedEnv.data.QUOTE_FOLLOWUP_FUNCTION_NAME,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify({ submission_id: submissionId })),
        }),
      );
    },
  };
}
