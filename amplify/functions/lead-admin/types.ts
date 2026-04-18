import type {
  LeadAdminJourneySummary,
  LeadAdminRecordSummary,
} from '../_lead-core/services/admin.ts';

export type LambdaEvent = {
  headers?: Record<string, string | undefined> | null;
  requestContext?: { http?: { method?: string; path?: string } } | null;
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
