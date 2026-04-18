import { z } from 'zod';
import {
  buildDefaultQualificationSnapshot,
  buildJourneyEvent,
} from '../_lead-core/services/shared.ts';
import { deriveLeadRecordStatus } from '../_lead-core/services/outreach.ts';
import {
  toLeadAdminJourneySummary,
  toLeadAdminRecordSummary,
  type LeadAdminJourneySummary,
  type LeadAdminRecordSummary,
} from '../_lead-core/services/admin.ts';
import { createLeadCoreRuntime } from '../_lead-core/runtime.ts';
import { decodeBody, emptyResponse, getHttpMethod, jsonResponse } from '../_shared/http.ts';
import { asObject } from '../_shared/safe.ts';

const MAX_LIMIT = 500;

const adminEnvSchema = z.object({
  LEADS_ADMIN_PASSWORD: z.string().trim().min(1),
});

const postPayloadSchema = z.looseObject({
  lead_record_id: z.unknown().optional(),
  qualified: z.unknown().optional(),
});

type LambdaEvent = {
  headers?: Record<string, string | undefined> | null;
  requestContext?: { http?: { method?: string; path?: string } } | null;
  httpMethod?: string;
  rawQueryString?: string | null;
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: string | null;
  isBase64Encoded?: boolean;
};

type LambdaResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

type CursorKey = Record<string, unknown>;

type LeadAdminDeps = {
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

function json(statusCode: number, body: unknown): LambdaResult {
  return jsonResponse(statusCode, body);
}

function unauthorizedResponse(): LambdaResult {
  return jsonResponse(
    401,
    { error: 'Unauthorized' },
    { 'WWW-Authenticate': 'Basic realm="Admin"' },
  );
}

function isAuthorized(event: LambdaEvent, adminPassword: string): boolean {
  const header = event?.headers?.authorization ?? event?.headers?.Authorization ?? '';
  if (!header.startsWith('Basic ')) return false;
  const encoded = header.slice('Basic '.length).trim();
  if (!encoded) return false;
  let decoded = '';
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return false;
  }
  const [user, pass] = decoded.split(':');
  if (!user) return false;
  return pass === adminPassword;
}

function parseLimit(value: string | undefined): number {
  const parsed = parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(parsed, MAX_LIMIT);
}

function parseBool(value: string | undefined): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function encodeCursor(key: CursorKey | undefined): string | null {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key)).toString('base64');
}

function decodeCursor(value: string | undefined): CursorKey | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    const record = asObject(parsed);
    return record ? (record as CursorKey) : undefined;
  } catch {
    return undefined;
  }
}

export function createLeadAdminHandler(deps: LeadAdminDeps) {
  return async (event: LambdaEvent): Promise<LambdaResult> => {
    const method = getHttpMethod(event);

    if (method === 'OPTIONS') {
      return emptyResponse(204);
    }

    if (!deps.configValid) {
      return json(500, { error: 'Server missing configuration' });
    }

    if (!isAuthorized(event, deps.adminPassword)) {
      return unauthorizedResponse();
    }

    if (method === 'GET') {
      const qs = event.queryStringParameters ?? {};
      const limit = parseLimit(qs.limit);
      const qualifiedFilter = parseBool(qs.qualified);
      const recordsCursor = decodeCursor(qs.records_cursor ?? qs.cursor);
      const journeysCursor = decodeCursor(qs.journeys_cursor);

      const [recordsResult, journeysResult] = await Promise.all([
        deps.listLeadRecords({
          limit,
          qualifiedFilter,
          cursor: recordsCursor,
        }),
        deps.listJourneys({
          limit,
          cursor: journeysCursor,
        }),
      ]);

      const leadRecords = Array.isArray(recordsResult.items) ? recordsResult.items : [];
      const journeys = Array.isArray(journeysResult.items) ? journeysResult.items : [];

      return json(200, {
        lead_records: leadRecords,
        journeys,
        next_records_cursor: encodeCursor(recordsResult.lastEvaluatedKey),
        next_journeys_cursor: encodeCursor(journeysResult.lastEvaluatedKey),
      });
    }

    if (method === 'POST') {
      let parsedPayload: z.infer<typeof postPayloadSchema>;
      try {
        const body = decodeBody(event);
        const parsed = body ? JSON.parse(body) : {};
        const result = postPayloadSchema.safeParse(parsed);
        if (!result.success) return json(400, { error: 'Invalid request payload' });
        parsedPayload = result.data;
      } catch {
        return json(400, { error: 'Invalid JSON body' });
      }

      const leadRecordIdResult = z.string().trim().min(1).safeParse(parsedPayload.lead_record_id);
      if (!leadRecordIdResult.success) return json(400, { error: 'Missing lead_record_id' });

      const qualifiedResult = z.boolean().safeParse(parsedPayload.qualified);
      if (!qualifiedResult.success) {
        return json(400, { error: 'Missing qualified boolean' });
      }

      const updated = await deps.updateLeadRecordQualification({
        leadRecordId: leadRecordIdResult.data,
        qualified: qualifiedResult.data,
        qualifiedAtMs: deps.nowEpochMs(),
      });

      if (!updated) {
        return json(404, { error: 'Lead record not found' });
      }

      return json(200, {
        ok: true,
        lead_record_id: leadRecordIdResult.data,
        qualified: qualifiedResult.data,
      });
    }

    return json(405, { error: 'Method not allowed' });
  };
}

const parsedEnv = adminEnvSchema.safeParse(process.env);
const leadCoreRuntime = createLeadCoreRuntime(process.env);

export const handler = createLeadAdminHandler({
  configValid: Boolean(
    parsedEnv.success && parsedEnv.data.LEADS_ADMIN_PASSWORD && leadCoreRuntime.configValid,
  ),
  adminPassword: parsedEnv.success ? parsedEnv.data.LEADS_ADMIN_PASSWORD : '',
  listLeadRecords: async ({ limit, qualifiedFilter, cursor }) => {
    const repos = leadCoreRuntime.repos;
    if (!repos) return { items: [] };

    const result = await repos.leadRecords.listPage({
      limit,
      qualifiedFilter,
      cursor,
    });

    const contacts = await Promise.all(
      result.items.map((leadRecord) =>
        leadRecord.contact_id
          ? repos.contacts.getById(leadRecord.contact_id)
          : Promise.resolve(null),
      ),
    );

    return {
      items: result.items.map((leadRecord, index) =>
        toLeadAdminRecordSummary({
          leadRecord,
          contact: contacts[index] ?? null,
        }),
      ),
      lastEvaluatedKey: result.lastEvaluatedKey,
    };
  },
  listJourneys: async ({ limit, cursor }) => {
    const repos = leadCoreRuntime.repos;
    if (!repos) return { items: [] };
    const result = await repos.journeys.listPage({ limit, cursor });
    return {
      items: result.items.map((journey) => toLeadAdminJourneySummary(journey)),
      lastEvaluatedKey: result.lastEvaluatedKey,
    };
  },
  updateLeadRecordQualification: async ({ leadRecordId, qualified, qualifiedAtMs }) => {
    const repos = leadCoreRuntime.repos;
    if (!repos) return false;

    const existingLeadRecord = await repos.leadRecords.getById(leadRecordId);
    if (!existingLeadRecord) return false;

    const qualification = buildDefaultQualificationSnapshot({
      ...existingLeadRecord.qualification,
      qualified,
      qualified_at_ms: qualified ? qualifiedAtMs : null,
    });

    const updatedLeadRecord = {
      ...existingLeadRecord,
      qualification,
      status: deriveLeadRecordStatus({
        qualification,
        latestOutreach: existingLeadRecord.latest_outreach,
      }),
      updated_at_ms: qualifiedAtMs,
    };

    await repos.leadRecords.put(updatedLeadRecord);
    await repos.journeyEvents.append(
      buildJourneyEvent({
        journeyId: existingLeadRecord.journey_id,
        leadRecordId,
        eventName: qualified ? 'lead_record_qualified' : 'lead_record_unqualified',
        occurredAtMs: qualifiedAtMs,
        recordedAtMs: qualifiedAtMs,
        actor: 'admin',
        discriminator: `${leadRecordId}:${qualified}:${qualifiedAtMs}`,
        payload: {
          qualified,
        },
      }),
    );

    const existingJourney = await repos.journeys.getById(existingLeadRecord.journey_id);
    if (existingJourney) {
      await repos.journeys.put({
        ...existingJourney,
        lead_record_id: leadRecordId,
        journey_status: qualified ? 'qualified' : 'captured',
        updated_at_ms: qualifiedAtMs,
      });
    }

    return true;
  },
  nowEpochMs: () => Date.now(),
});
