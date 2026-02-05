import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const leadAttributionTableName = process.env.LEAD_ATTRIBUTION_TABLE_NAME;
const leadAttributionDb =
  leadAttributionTableName && leadAttributionTableName.trim()
    ? DynamoDBDocumentClient.from(new DynamoDBClient({}))
    : null;

const adminPassword = process.env.LEADS_ADMIN_PASSWORD ?? '';

const MAX_LIMIT = 500;

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://craigs.autos',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,authorization',
};

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

type UpdateRequest = {
  lead_id?: unknown;
  qualified?: unknown;
};

function json(statusCode: number, body: unknown): LambdaResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
    body: JSON.stringify(body),
  };
}

function decodeBody(event: LambdaEvent): string | null {
  const raw = event?.body;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (event?.isBase64Encoded) {
    return Buffer.from(raw, 'base64').toString('utf8');
  }
  return raw;
}

function isAuthorized(event: LambdaEvent): boolean {
  if (!adminPassword) return false;
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

export const handler = async (event: LambdaEvent): Promise<LambdaResult> => {
  const method = event?.requestContext?.http?.method ?? event?.httpMethod;

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (!leadAttributionDb || !leadAttributionTableName) {
    return json(500, { error: 'Server missing configuration' });
  }

  if (!isAuthorized(event)) {
    return {
      statusCode: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Admin"',
        ...corsHeaders,
      },
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  if (method === 'GET') {
    const qs = event.queryStringParameters ?? {};
    const limit = parseLimit(qs.limit);
    const qualifiedFilter = parseBool(qs.qualified);
    const cursor = decodeCursor(qs.cursor);

    const scanInput: any = {
      TableName: leadAttributionTableName,
      Limit: limit,
    };

    if (cursor) scanInput.ExclusiveStartKey = cursor;

    if (qualifiedFilter !== null) {
      scanInput.FilterExpression = '#qualified = :qualified';
      scanInput.ExpressionAttributeNames = { '#qualified': 'qualified' };
      scanInput.ExpressionAttributeValues = { ':qualified': qualifiedFilter };
    }

    const result = await leadAttributionDb.send(new ScanCommand(scanInput));
    const items = Array.isArray(result.Items) ? result.Items : [];

    items.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    return json(200, {
      items,
      next_cursor: encodeCursor(result.LastEvaluatedKey),
    });
  }

  if (method === 'POST') {
    let payload: UpdateRequest = {};
    try {
      const body = decodeBody(event);
      const parsed = body ? JSON.parse(body) : {};
      payload = parsed && typeof parsed === 'object' ? (parsed as UpdateRequest) : {};
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    const leadId = typeof payload.lead_id === 'string' ? payload.lead_id.trim() : '';
    if (!leadId) return json(400, { error: 'Missing lead_id' });

    if (typeof payload.qualified !== 'boolean') {
      return json(400, { error: 'Missing qualified boolean' });
    }

    const now = nowEpochSeconds();
    await leadAttributionDb.send(
      new UpdateCommand({
        TableName: leadAttributionTableName,
        Key: { lead_id: leadId },
        UpdateExpression: 'SET #qualified = :qualified, #qualified_at = :qualified_at',
        ExpressionAttributeNames: {
          '#qualified': 'qualified',
          '#qualified_at': 'qualified_at',
        },
        ExpressionAttributeValues: {
          ':qualified': payload.qualified,
          ':qualified_at': now,
        },
      })
    );

    return json(200, { ok: true, lead_id: leadId, qualified: payload.qualified });
  }

  return json(405, { error: 'Method not allowed' });
};
