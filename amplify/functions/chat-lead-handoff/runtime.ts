import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { SchedulerClient } from '@aws-sdk/client-scheduler';
import OpenAI from 'openai';
import { z } from 'zod';
import { CRAIGS_LEAD_ENV_DEFAULTS } from '../../../shared/business-profile.js';
import type { TranscriptLine } from './lead-types.ts';

const chatLeadHandoffEnvSchema = z.object({
  CHATKIT_OPENAI_API_KEY: z.string().trim().min(1),
});

const parsedChatLeadHandoffEnv = chatLeadHandoffEnvSchema.safeParse(process.env);
const apiKey = parsedChatLeadHandoffEnv.success
  ? parsedChatLeadHandoffEnv.data.CHATKIT_OPENAI_API_KEY
  : '';

export const openai = apiKey ? new OpenAI({ apiKey }) : null;

export const leadDedupeTableName = process.env.LEAD_DEDUPE_TABLE_NAME;
export const leadDedupeDb = leadDedupeTableName?.trim()
  ? DynamoDBDocumentClient.from(new DynamoDBClient({}))
  : null;

export const messageLinkTokenTableName = process.env.MESSAGE_LINK_TOKEN_TABLE_NAME;
export const messageLinkDb = messageLinkTokenTableName?.trim()
  ? DynamoDBDocumentClient.from(new DynamoDBClient({}))
  : null;

export const leadToEmail = process.env.LEAD_TO_EMAIL ?? CRAIGS_LEAD_ENV_DEFAULTS.LEAD_TO_EMAIL;
export const leadFromEmail =
  process.env.LEAD_FROM_EMAIL ?? CRAIGS_LEAD_ENV_DEFAULTS.LEAD_FROM_EMAIL;
export const leadSummaryModel = process.env.LEAD_SUMMARY_MODEL ?? 'gpt-5.2-2025-12-11';
export const quoEnabled = isEnabledValue(process.env.QUO_ENABLED);
export const quoApiKey = process.env.QUO_API_KEY?.trim() ?? '';
export const quoFromPhoneNumberId = process.env.QUO_FROM_PHONE_NUMBER_ID?.trim() ?? '';
export const quoUserId = process.env.QUO_USER_ID?.trim() ?? '';
export const quoContactSource =
  process.env.QUO_CONTACT_SOURCE?.trim() ?? CRAIGS_LEAD_ENV_DEFAULTS.QUO_CONTACT_SOURCE;
export const quoContactExternalIdPrefix =
  process.env.QUO_CONTACT_EXTERNAL_ID_PREFIX?.trim() ??
  CRAIGS_LEAD_ENV_DEFAULTS.QUO_CONTACT_EXTERNAL_ID_PREFIX;
export const quoLeadTagsFieldKey = process.env.QUO_LEAD_TAGS_FIELD_KEY?.trim() ?? '';
export const quoLeadTagsFieldName =
  process.env.QUO_LEAD_TAGS_FIELD_NAME?.trim() ?? CRAIGS_LEAD_ENV_DEFAULTS.QUO_LEAD_TAGS_FIELD_NAME;
export const leadRetrySchedulerRoleArn = process.env.LEAD_RETRY_SCHEDULER_ROLE_ARN ?? '';
export const leadRetryScheduleGroupName = process.env.LEAD_RETRY_SCHEDULE_GROUP ?? 'default';

export const SHOP_NAME = process.env.SHOP_NAME ?? CRAIGS_LEAD_ENV_DEFAULTS.SHOP_NAME;
export const SHOP_PHONE_DISPLAY =
  process.env.SHOP_PHONE_DISPLAY ?? CRAIGS_LEAD_ENV_DEFAULTS.SHOP_PHONE_DISPLAY;
export const SHOP_PHONE_DIGITS =
  process.env.SHOP_PHONE_DIGITS ?? CRAIGS_LEAD_ENV_DEFAULTS.SHOP_PHONE_DIGITS;
export const SHOP_ADDRESS = process.env.SHOP_ADDRESS ?? CRAIGS_LEAD_ENV_DEFAULTS.SHOP_ADDRESS;

export const ses = new SESv2Client({});
export const scheduler = leadRetrySchedulerRoleArn ? new SchedulerClient({}) : null;

export const LEAD_DEDUPE_LEASE_SECONDS = 120;
export const LEAD_DEDUPE_ERROR_COOLDOWN_SECONDS = 60;
export const LEAD_DEDUPE_TTL_DAYS = 30;
export const LEAD_IDLE_DELAY_SECONDS = 300;
export const LEAD_RETRY_GRACE_SECONDS = 5;
export const LEAD_ATTRIBUTION_TTL_DAYS = 180;
export const MESSAGE_LINK_TOKEN_TTL_DAYS = 7;
export const LEAD_EMAIL_RAW_MESSAGE_MAX_BYTES = 28 * 1024 * 1024;

export function isValidThreadId(value: string): boolean {
  return value.startsWith('cthr_') && value.length > 'cthr_'.length;
}

export function isEnabledValue(value: string | undefined): boolean {
  return /^(1|true|yes)$/i.test((value ?? '').trim());
}

export function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function ttlSecondsFromNow(days: number): number {
  return nowEpochSeconds() + days * 24 * 60 * 60;
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
