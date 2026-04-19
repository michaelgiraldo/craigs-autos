import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createLeadPlatformRuntime } from '../_lead-platform/runtime.ts';
import {
  createManualConversionFeedbackAdapter,
  DEFAULT_CONVERSION_FEEDBACK_BATCH_SIZE,
  DEFAULT_CONVERSION_FEEDBACK_LEASE_MS,
  DEFAULT_CONVERSION_FEEDBACK_MAX_ATTEMPTS,
  type ManagedConversionFeedbackAdapter,
} from '../_lead-platform/services/managed-conversion-feedback-worker.ts';

const envSchema = z.object({
  MANAGED_CONVERSION_FEEDBACK_BATCH_SIZE: z.coerce.number().int().positive().optional(),
  MANAGED_CONVERSION_FEEDBACK_LEASE_SECONDS: z.coerce.number().int().positive().optional(),
  MANAGED_CONVERSION_FEEDBACK_MAX_ATTEMPTS: z.coerce.number().int().positive().optional(),
  AWS_LAMBDA_FUNCTION_NAME: z.string().trim().min(1).optional(),
});

export type ManagedConversionFeedbackWorkerRuntime = {
  configValid: boolean;
  repos: ReturnType<typeof createLeadPlatformRuntime>['repos'];
  nowMs: () => number;
  createWorkerId: () => string;
  adapters: ManagedConversionFeedbackAdapter[];
  batchSize: number;
  leaseMs: number;
  maxAttempts: number;
};

export function createManagedConversionFeedbackWorkerRuntime(
  env: NodeJS.ProcessEnv = process.env,
): ManagedConversionFeedbackWorkerRuntime {
  const parsed = envSchema.safeParse(env);
  const leadPlatformRuntime = createLeadPlatformRuntime(env);
  const functionName =
    parsed.success && parsed.data.AWS_LAMBDA_FUNCTION_NAME
      ? parsed.data.AWS_LAMBDA_FUNCTION_NAME
      : 'managed-conversion-feedback-worker';

  return {
    configValid: parsed.success && leadPlatformRuntime.configValid,
    repos: leadPlatformRuntime.repos,
    nowMs: () => Date.now(),
    createWorkerId: () => `${functionName}:${randomUUID()}`,
    adapters: [createManualConversionFeedbackAdapter()],
    batchSize: parsed.success
      ? (parsed.data.MANAGED_CONVERSION_FEEDBACK_BATCH_SIZE ??
        DEFAULT_CONVERSION_FEEDBACK_BATCH_SIZE)
      : DEFAULT_CONVERSION_FEEDBACK_BATCH_SIZE,
    leaseMs: parsed.success
      ? (parsed.data.MANAGED_CONVERSION_FEEDBACK_LEASE_SECONDS ??
          DEFAULT_CONVERSION_FEEDBACK_LEASE_MS / 1000) * 1000
      : DEFAULT_CONVERSION_FEEDBACK_LEASE_MS,
    maxAttempts: parsed.success
      ? (parsed.data.MANAGED_CONVERSION_FEEDBACK_MAX_ATTEMPTS ??
        DEFAULT_CONVERSION_FEEDBACK_MAX_ATTEMPTS)
      : DEFAULT_CONVERSION_FEEDBACK_MAX_ATTEMPTS,
  };
}
