import type { LeadAdminFollowupWorkSummary } from '../_lead-platform/services/admin-followup-work.ts';
import type {
  LeadAdminJourneySummary,
  LeadAdminRecordSummary,
} from '../_lead-platform/services/admin.ts';

export type LambdaEvent = {
  headers?: Record<string, string | undefined> | null;
  requestContext?: { http?: { method?: string; path?: string } } | null;
  rawPath?: string | null;
  httpMethod?: string;
  rawQueryString?: string | null;
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: string | null;
  isBase64Encoded?: boolean;
};

export type LambdaResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export type CursorKey = Record<string, unknown>;

export type LeadAdminDeps = {
  configValid: boolean;
  adminPassword: string;
  listLeadRecords: (args: {
    limit: number;
    qualifiedFilter: boolean | null;
    cursor?: CursorKey;
  }) => Promise<{ items: LeadAdminRecordSummary[]; lastEvaluatedKey?: CursorKey }>;
  listJourneys: (args: {
    limit: number;
    cursor?: CursorKey;
  }) => Promise<{ items: LeadAdminJourneySummary[]; lastEvaluatedKey?: CursorKey }>;
  listFollowupWork: (args: {
    limit: number;
    nowEpochSeconds: number;
  }) => Promise<{ items: LeadAdminFollowupWorkSummary[] }>;
  retryFollowupWork: (args: {
    idempotencyKey: string;
    nowEpochSeconds: number;
  }) => Promise<{ ok: true; invoked: boolean } | { ok: false; statusCode: number; error: string }>;
  resolveFollowupWorkManually: (args: {
    idempotencyKey: string;
    nowEpochSeconds: number;
    reason: string;
  }) => Promise<{ ok: true } | { ok: false; statusCode: number; error: string }>;
  updateLeadRecordQualification: (args: {
    leadRecordId: string;
    qualified: boolean;
    qualifiedAtMs: number;
  }) => Promise<boolean>;
  nowEpochMs: () => number;
};

export type LeadAdminListRequest = {
  limit: number;
  qualifiedFilter: boolean | null;
  recordsCursor?: CursorKey;
  journeysCursor?: CursorKey;
};

export type LeadQualificationRequest = {
  leadRecordId: string;
  qualified: boolean;
};

export type LeadFollowupWorkActionRequest = {
  idempotencyKey: string;
  reason: string;
};
