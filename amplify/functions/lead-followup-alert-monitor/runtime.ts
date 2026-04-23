import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { CRAIGS_LEAD_ENV_DEFAULTS } from '@craigs/business-profile/business-profile';
import { createSesEmailProvider } from '../_lead-platform/services/providers/ses/ses-provider.ts';
import { DynamoLeadFollowupWorkRepo } from '../_lead-platform/repos/dynamo.ts';
import type { LeadFollowupFailureAlertKind } from '../_lead-platform/domain/lead-followup-work.ts';
import { buildLeadFailureAlertEmailContent } from './lead-failure-alert-email.ts';
import {
  DEFAULT_LEAD_FAILURE_ALERT_BATCH_SIZE,
  DEFAULT_LEAD_FAILURE_ALERT_MIN_INTERVAL_SECONDS,
  type LeadFollowupAlertMonitorDeps,
} from './process-lead-followup-alert-monitor.ts';

const envSchema = z.object({
  LEAD_FAILURE_ALERT_BATCH_SIZE: z.coerce.number().int().positive().optional(),
  LEAD_FAILURE_ALERT_EMAILS: z.string().trim().min(1),
  LEAD_FAILURE_ALERT_FROM_EMAIL: z.string().trim().email(),
  LEAD_FAILURE_ALERT_MIN_INTERVAL_SECONDS: z.coerce.number().int().positive().optional(),
  LEAD_FOLLOWUP_WORK_TABLE_NAME: z.string().trim().min(1),
});

function parseRecipientList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export type LeadFollowupAlertMonitorRuntime = LeadFollowupAlertMonitorDeps & {
  recipientEmails: string[];
};

export function createLeadFollowupAlertMonitorRuntime(
  env: NodeJS.ProcessEnv = process.env,
): LeadFollowupAlertMonitorRuntime {
  const parsed = envSchema.safeParse(env);
  const db = parsed.success ? DynamoDBDocumentClient.from(new DynamoDBClient({})) : null;
  const ses = parsed.success ? new SESv2Client({}) : null;
  const emailProvider = createSesEmailProvider({ ses });
  const recipientEmails = parsed.success
    ? parseRecipientList(parsed.data.LEAD_FAILURE_ALERT_EMAILS)
    : [];
  const followupWorkRepo =
    parsed.success && db
      ? new DynamoLeadFollowupWorkRepo(db, parsed.data.LEAD_FOLLOWUP_WORK_TABLE_NAME)
      : null;

  return {
    batchSize: parsed.success
      ? (parsed.data.LEAD_FAILURE_ALERT_BATCH_SIZE ??
          Number.parseInt(CRAIGS_LEAD_ENV_DEFAULTS.LEAD_FAILURE_ALERT_BATCH_SIZE, 10)) ||
        DEFAULT_LEAD_FAILURE_ALERT_BATCH_SIZE
      : DEFAULT_LEAD_FAILURE_ALERT_BATCH_SIZE,
    configValid:
      parsed.success &&
      Boolean(followupWorkRepo) &&
      emailProvider.readiness.ready &&
      recipientEmails.length > 0,
    getFollowupWork: async (idempotencyKey) =>
      followupWorkRepo ? followupWorkRepo.getByIdempotencyKey(idempotencyKey) : null,
    listFollowupWorkByStatus: async (status, options) =>
      followupWorkRepo ? followupWorkRepo.listByStatus(status, options) : [],
    minIntervalSeconds: parsed.success
      ? (parsed.data.LEAD_FAILURE_ALERT_MIN_INTERVAL_SECONDS ??
          Number.parseInt(CRAIGS_LEAD_ENV_DEFAULTS.LEAD_FAILURE_ALERT_MIN_INTERVAL_SECONDS, 10)) ||
        DEFAULT_LEAD_FAILURE_ALERT_MIN_INTERVAL_SECONDS
      : DEFAULT_LEAD_FAILURE_ALERT_MIN_INTERVAL_SECONDS,
    nowEpochSeconds: () => Math.floor(Date.now() / 1000),
    recipientEmails,
    sendFailureAlertEmail: async (args: {
      alertKind: Exclude<LeadFollowupFailureAlertKind, null>;
      record: Parameters<LeadFollowupAlertMonitorDeps['sendFailureAlertEmail']>[0]['record'];
    }) => {
      if (!parsed.success || !recipientEmails.length) {
        throw new Error(
          'Lead follow-up alert monitor is missing sender or recipient email config.',
        );
      }
      const message = buildLeadFailureAlertEmailContent(args);
      const result = await emailProvider.sendEmail({
        from: parsed.data.LEAD_FAILURE_ALERT_FROM_EMAIL,
        headers: {
          'X-Craigs-System-Alert': 'lead-followup-failure-v1',
        },
        html: message.html,
        subject: message.subject,
        text: message.text,
        to: recipientEmails,
      });
      return { messageId: result.messageId };
    },
    updateFailureAlertState: async (args) =>
      followupWorkRepo ? followupWorkRepo.updateFailureAlertState(args) : false,
  };
}
