import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { z } from 'zod';
import { createLeadPlatformRuntime } from '../_lead-platform/runtime.ts';
import { persistQuoteRequestLeadIntake } from '../_lead-platform/services/followup-work.ts';
import type { SubmitQuoteRequestDeps } from './submit-quote-request.ts';

const envSchema = z.object({
  CONTACT_SITE_LABEL: z.string().trim().min(1),
  LEAD_FOLLOWUP_WORKER_FUNCTION_NAME: z.string().trim().min(1),
});

export function createQuoteRequestSubmitRuntime(
  env: NodeJS.ProcessEnv = process.env,
): SubmitQuoteRequestDeps {
  const parsedEnv = envSchema.safeParse(env);
  const lambda = parsedEnv.success ? new LambdaClient({}) : null;
  const leadPlatformRuntime = createLeadPlatformRuntime(env);

  return {
    configValid: parsedEnv.success && Boolean(lambda) && leadPlatformRuntime.configValid,
    nowEpochSeconds: () => Math.floor(Date.now() / 1000),
    repos: leadPlatformRuntime.repos,
    siteLabel: parsedEnv.success ? parsedEnv.data.CONTACT_SITE_LABEL : '',
    persistQuoteRequest: async (input) => {
      const repos = leadPlatformRuntime.repos;
      if (!repos) return null;
      return persistQuoteRequestLeadIntake({ repos, input });
    },
    invokeFollowup: async (idempotencyKey: string) => {
      if (!lambda || !parsedEnv.success) return;
      await lambda.send(
        new InvokeCommand({
          FunctionName: parsedEnv.data.LEAD_FOLLOWUP_WORKER_FUNCTION_NAME,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify({ idempotency_key: idempotencyKey })),
        }),
      );
    },
  };
}
