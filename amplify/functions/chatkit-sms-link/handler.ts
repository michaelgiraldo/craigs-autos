import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const tokenTableName = process.env.SMS_LINK_TOKEN_TABLE_NAME;
const db =
  tokenTableName && tokenTableName.trim()
    ? DynamoDBDocumentClient.from(new DynamoDBClient({}))
    : null;

type LambdaEvent = {
  headers?: Record<string, string | undefined> | null;
  requestContext?: { http?: { method?: string } } | null;
  httpMethod?: string;
  queryStringParameters?: Record<string, string> | null;
  rawQueryString?: string;
};

type LambdaResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function json(statusCode: number, body: unknown): LambdaResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function getQueryParam(rawQueryString: string | undefined, key: string): string | null {
  if (!rawQueryString) return null;
  const params = new URLSearchParams(rawQueryString);
  const value = params.get(key);
  return value && value.trim() ? value.trim() : null;
}

function isValidToken(value: string): boolean {
  // Tokens are generated with randomUUID().
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export const handler = async (event: LambdaEvent): Promise<LambdaResult> => {
  const method = event?.requestContext?.http?.method ?? event?.httpMethod;

  if (method === 'OPTIONS') {
    // Lambda Function URL CORS handles the browser preflight automatically.
    return { statusCode: 204, headers: {}, body: '' };
  }

  if (method !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });
  if (!db || !tokenTableName) return json(500, { ok: false, error: 'server_not_configured' });

  const token =
    (event?.queryStringParameters && typeof event.queryStringParameters.token === 'string'
      ? event.queryStringParameters.token.trim()
      : null) ?? getQueryParam(event?.rawQueryString, 'token');

  if (!token) return json(400, { ok: false, error: 'missing_token' });
  if (!isValidToken(token)) return json(400, { ok: false, error: 'invalid_token' });

  try {
    const result = await db.send(
      new GetCommand({
        TableName: tokenTableName,
        Key: { token },
      })
    );

    const item: any = result?.Item ?? null;
    if (!item) return json(404, { ok: false, error: 'not_found' });

    const ttl = typeof item.ttl === 'number' ? item.ttl : null;
    if (ttl && ttl <= nowEpochSeconds()) return json(410, { ok: false, error: 'expired' });

    const toPhone = typeof item.to_phone === 'string' ? item.to_phone : '';
    const body = typeof item.body === 'string' ? item.body : '';

    if (!toPhone) return json(500, { ok: false, error: 'bad_record' });

    return json(200, { ok: true, to_phone: toPhone, body });
  } catch (err: any) {
    console.error('SMS link token lookup failed', err?.name, err?.message);
    return json(500, { ok: false, error: 'server_error' });
  }
};

