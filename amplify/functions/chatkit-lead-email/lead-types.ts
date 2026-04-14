import type { AttributionSnapshot } from '../_lead-core/domain/types.ts';

export type LambdaHeaders = Record<string, string | undefined>;

export type LambdaEvent = {
  headers?: LambdaHeaders | null;
  requestContext?: { http?: { method?: string } } | null;
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
};

export type LambdaResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export type LeadEmailRequest = {
  threadId?: unknown;
  journey_id?: unknown;
  locale?: unknown;
  pageUrl?: unknown;
  user?: unknown;
  reason?: unknown;
  attribution?: unknown;
};

export type TranscriptLine = {
  created_at: number;
  speaker: string;
  text: string;
};

export type LeadAttachment = {
  id?: string | null;
  name: string;
  mime: string | null;
  url: string;
};

export type LeadSummary = {
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_location: string | null;
  customer_language: string | null;
  vehicle: string | null;
  project: string | null;
  timeline: string | null;
  handoff_ready: boolean;
  handoff_reason: string;
  summary: string;
  next_steps: string[];
  follow_up_questions: string[];
  call_script_prompts: string[];
  outreach_message: string | null;
  missing_info: string[];
};

export type LeadDedupeStatus = 'sending' | 'sent' | 'error';

export type LeadDedupeRecord = {
  thread_id: string;
  status: LeadDedupeStatus;
  lock_expires_at?: number;
  lease_id?: string;
  created_at?: number;
  updated_at?: number;
  attempts?: number;
  sent_at?: number;
  message_id?: string;
  email_sent_at?: number;
  email_message_id?: string;
  quo_sent_at?: number;
  quo_message_id?: string;
  quo_last_error?: string;
  last_reason?: string;
  last_error?: string;
  ttl?: number;
};

export type LeadAttributionPayload = AttributionSnapshot | null;
