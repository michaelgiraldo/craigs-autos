import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { decodeBody, emptyResponse, getHttpMethod, jsonResponse } from '../_shared/http.ts';

const MAX_LIMIT = 500;
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://craigs.autos',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,authorization',
};

const adminEnvSchema = z.object({
  LEAD_ATTRIBUTION_TABLE_NAME: z.string().trim().min(1),
  LEADS_ADMIN_PASSWORD: z.string().trim().min(1),
});

const postPayloadSchema = z
  .object({
    lead_id: z.unknown().optional(),
    qualified: z.unknown().optional(),
  })
  .passthrough();

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

type LeadAdminDeps = {
  configValid: boolean;
  adminPassword: string;
  scanLeads: (args: {
    limit: number;
    qualifiedFilter: boolean | null;
    cursor?: Record<string, any>;
  }) => Promise<{ items: any[]; lastEvaluatedKey?: Record<string, any> }>;
  updateLead: (args: { leadId: string; qualified: boolean; qualifiedAt: number }) => Promise<void>;
  nowEpochSeconds: () => number;
};

function json(statusCode: number, body: unknown): LambdaResult {
  return jsonResponse(statusCode, body, corsHeaders);
}

function unauthorizedResponse(): LambdaResult {
  return {
    statusCode: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Admin"',
      ...corsHeaders,
    },
    body: JSON.stringify({ error: 'Unauthorized' }),
  };
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

function encodeCursor(key: Record<string, any> | undefined): string | null {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key)).toString('base64');
}

function decodeCursor(value: string | undefined): Record<string, any> | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
  } catch {
    return undefined;
  }
}

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function createLeadAdminHandler(deps: LeadAdminDeps) {
  return async (event: LambdaEvent): Promise<LambdaResult> => {
    const method = getHttpMethod(event);

    if (method === 'OPTIONS') {
      return emptyResponse(204, corsHeaders);
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
      const cursor = decodeCursor(qs.cursor);

      const result = await deps.scanLeads({
        limit,
        qualifiedFilter,
        cursor,
      });

      const items = Array.isArray(result.items) ? result.items : [];
      items.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

      return json(200, {
        items,
        next_cursor: encodeCursor(result.lastEvaluatedKey),
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

      const leadIdResult = z.string().trim().min(1).safeParse(parsedPayload.lead_id);
      if (!leadIdResult.success) return json(400, { error: 'Missing lead_id' });

      const qualifiedResult = z.boolean().safeParse(parsedPayload.qualified);
      if (!qualifiedResult.success) {
        return json(400, { error: 'Missing qualified boolean' });
      }

      await deps.updateLead({
        leadId: leadIdResult.data,
        qualified: qualifiedResult.data,
        qualifiedAt: deps.nowEpochSeconds(),
      });

      return json(200, {
        ok: true,
        lead_id: leadIdResult.data,
        qualified: qualifiedResult.data,
      });
    }

    return json(405, { error: 'Method not allowed' });
  };
}

const parsedEnv = adminEnvSchema.safeParse(process.env);
const runtimeTableName = parsedEnv.success ? parsedEnv.data.LEAD_ATTRIBUTION_TABLE_NAME : '';
const runtimeAdminPassword = parsedEnv.success ? parsedEnv.data.LEADS_ADMIN_PASSWORD : '';
const runtimeDb = runtimeTableName ? DynamoDBDocumentClient.from(new DynamoDBClient({})) : null;

export const handler = createLeadAdminHandler({
  configValid: Boolean(parsedEnv.success && runtimeDb && runtimeTableName && runtimeAdminPassword),
  adminPassword: runtimeAdminPassword,
  scanLeads: async ({ limit, qualifiedFilter, cursor }) => {
    if (!runtimeDb || !runtimeTableName) return { items: [] };
    const scanInput: any = {
      TableName: runtimeTableName,
      Limit: limit,
    };

    if (cursor) scanInput.ExclusiveStartKey = cursor;

    if (qualifiedFilter !== null) {
      scanInput.FilterExpression = '#qualified = :qualified';
      scanInput.ExpressionAttributeNames = { '#qualified': 'qualified' };
      scanInput.ExpressionAttributeValues = { ':qualified': qualifiedFilter };
    }

    const result = await runtimeDb.send(new ScanCommand(scanInput));
    return {
      items: Array.isArray(result.Items) ? result.Items : [],
      lastEvaluatedKey: result.LastEvaluatedKey,
    };
  },
  updateLead: async ({ leadId, qualified, qualifiedAt }) => {
    if (!runtimeDb || !runtimeTableName) return;
    await runtimeDb.send(
      new UpdateCommand({
        TableName: runtimeTableName,
        Key: { lead_id: leadId },
        UpdateExpression: 'SET #qualified = :qualified, #qualified_at = :qualified_at',
        ExpressionAttributeNames: {
          '#qualified': 'qualified',
          '#qualified_at': 'qualified_at',
        },
        ExpressionAttributeValues: {
          ':qualified': qualified,
          ':qualified_at': qualifiedAt,
        },
      }),
    );
  },
  nowEpochSeconds,
});
