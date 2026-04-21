import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
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
    createFollowupWorkId: () => randomUUID(),
    nowEpochSeconds: () => Math.floor(Date.now() / 1000),
    siteLabel: parsedEnv.success ? parsedEnv.data.CONTACT_SITE_LABEL : '',
    persistQuoteRequest: async (input) => {
      const repos = leadPlatformRuntime.repos;
      if (!repos) return null;
      return persistQuoteRequestLeadIntake({ repos, input });
    },
    enqueueFollowupWork: async (record: LeadFollowupWorkItem) => {
      await leadPlatformRuntime.repos?.followupWork.putIfAbsent(record);
    },
    invokeFollowup: async (followupWorkId: string) => {
      if (!lambda || !parsedEnv.success) return;
      await lambda.send(
        new InvokeCommand({
          FunctionName: parsedEnv.data.LEAD_FOLLOWUP_WORKER_FUNCTION_NAME,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify({ followup_work_id: followupWorkId })),
        }),
      );
    },
  };
}
