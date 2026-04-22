import { LambdaClient } from '@aws-sdk/client-lambda';
import { SchedulerClient } from '@aws-sdk/client-scheduler';
import OpenAI from 'openai';
import { z } from 'zod';
import { CRAIGS_LEAD_ENV_DEFAULTS } from '@craigs/business-profile/business-profile';
import { LEAD_AI_TASK_POLICY } from '@craigs/contracts/lead-ai-policy';
import type { TranscriptLine } from './lead-types.ts';

const chatHandoffPromoteEnvSchema = z.object({
  CHATKIT_OPENAI_API_KEY: z.string().trim().min(1),
});

const parsedChatHandoffPromoteEnv = chatHandoffPromoteEnvSchema.safeParse(process.env);
const apiKey = parsedChatHandoffPromoteEnv.success
  ? parsedChatHandoffPromoteEnv.data.CHATKIT_OPENAI_API_KEY
  : '';

export const openai = apiKey ? new OpenAI({ apiKey }) : null;

export const leadFollowupWorkerFunctionName = process.env.LEAD_FOLLOWUP_WORKER_FUNCTION_NAME ?? '';
export const leadFollowupLambda = leadFollowupWorkerFunctionName.trim()
  ? new LambdaClient({})
  : null;

export const leadSummaryModel =
  process.env.LEAD_SUMMARY_MODEL ?? LEAD_AI_TASK_POLICY.chatTranscriptLeadSummary.model;
export const leadRetrySchedulerRoleArn = process.env.LEAD_RETRY_SCHEDULER_ROLE_ARN ?? '';
export const leadRetryScheduleGroupName = process.env.LEAD_RETRY_SCHEDULE_GROUP ?? 'default';

export const SHOP_NAME = process.env.SHOP_NAME ?? CRAIGS_LEAD_ENV_DEFAULTS.SHOP_NAME;
export const SHOP_PHONE_DISPLAY =
  process.env.SHOP_PHONE_DISPLAY ?? CRAIGS_LEAD_ENV_DEFAULTS.SHOP_PHONE_DISPLAY;
export const SHOP_PHONE_DIGITS =
  process.env.SHOP_PHONE_DIGITS ?? CRAIGS_LEAD_ENV_DEFAULTS.SHOP_PHONE_DIGITS;

export const scheduler = leadRetrySchedulerRoleArn ? new SchedulerClient({}) : null;

export const LEAD_IDLE_DELAY_SECONDS = 300;
export const LEAD_RETRY_GRACE_SECONDS = 5;

export function isValidThreadId(value: string): boolean {
  return value.startsWith('cthr_') && value.length > 'cthr_'.length;
}

export function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function latestActivityEpochSeconds(lines: TranscriptLine[]): number | null {
  if (!lines.length) return null;
  let latest = 0;
  for (const line of lines) {
    const createdAt = Math.floor(line?.created_at ?? 0);
    if (createdAt > latest) latest = createdAt;
  }
  return latest > 0 ? latest : null;
}
