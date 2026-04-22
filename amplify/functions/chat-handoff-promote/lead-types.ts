import type { AttributionSnapshot } from '../_lead-platform/domain/attribution.ts';
export type { LeadSummary } from '../_lead-platform/domain/lead-summary.ts';

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

export type ChatHandoffPromoteRequest = {
  threadId?: unknown;
  journey_id?: unknown;
  locale?: unknown;
  pageUrl?: unknown;
  user?: unknown;
  reason?: unknown;
  attribution?: unknown;
};

export type ChatHandoffStatus =
  | 'blocked'
  | 'deferred'
  | 'accepted'
  | 'already_accepted'
  | 'worker_failed'
  | 'worker_completed';

export type ChatHandoffResponse = {
  ok: true;
  status: ChatHandoffStatus;
  reason?: string;
  followup_work_id?: string;
  followup_work_status?: 'queued' | 'processing' | 'completed' | 'error';
  lead_record_id?: string;
  retry_scheduled?: boolean;
  scheduled_for?: number;
  last_activity_at?: number;
  idle_seconds?: number;
  seconds_since_last_activity?: number;
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

export type LeadAttributionPayload = AttributionSnapshot | null;
