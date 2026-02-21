import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { emptyResponse, getHttpMethod, getQueryParam, jsonResponse } from '../_shared/http.ts';

const messageLinkEnvSchema = z.object({
  MESSAGE_LINK_TOKEN_TABLE_NAME: z.string().trim().min(1),
});

const tokenSchema = z.string().uuid();

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
  return jsonResponse(statusCode, body, { 'Cache-Control': 'no-store' });
}

function isValidToken(value: string): boolean {
  // Tokens are generated with randomUUID().
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

type MessageLinkLookupResult = {
  ttl?: number;
  to_phone?: string;
  body?: string;
};

type MessageLinkHandlerDeps = {
  tableConfigured: boolean;
  lookupToken: (token: string) => Promise<MessageLinkLookupResult | null>;
  nowEpochSeconds: () => number;
};

export function createMessageLinkHandler(deps: MessageLinkHandlerDeps) {
  return async (event: LambdaEvent): Promise<LambdaResult> => {
    const method = getHttpMethod(event);

    if (method === 'OPTIONS') {
      // Lambda Function URL CORS handles the browser preflight automatically.
      return emptyResponse(204);
    }

    if (method !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });
    if (!deps.tableConfigured) {
      return json(500, { ok: false, error: 'server_not_configured' });
    }

    const token = getQueryParam(event, 'token');

    if (!token) return json(400, { ok: false, error: 'missing_token' });
    const tokenResult = tokenSchema.safeParse(token);
    if (!tokenResult.success || !isValidToken(tokenResult.data)) {
      return json(400, { ok: false, error: 'invalid_token' });
    }

    try {
      const item = await deps.lookupToken(tokenResult.data);
      if (!item) return json(404, { ok: false, error: 'not_found' });

      const ttl = typeof item.ttl === 'number' ? item.ttl : null;
      if (ttl && ttl <= deps.nowEpochSeconds()) return json(410, { ok: false, error: 'expired' });

      const toPhone = typeof item.to_phone === 'string' ? item.to_phone : '';
      const body = typeof item.body === 'string' ? item.body : '';

      if (!toPhone) return json(500, { ok: false, error: 'bad_record' });

      return json(200, { ok: true, to_phone: toPhone, body });
    } catch (err: any) {
      console.error('Message link token lookup failed', err?.name, err?.message);
      return json(500, { ok: false, error: 'server_error' });
    }
  };
}

const parsedMessageLinkEnv = messageLinkEnvSchema.safeParse(process.env);
const runtimeTokenTableName = parsedMessageLinkEnv.success
  ? parsedMessageLinkEnv.data.MESSAGE_LINK_TOKEN_TABLE_NAME
  : '';
const runtimeMessageLinkDb = runtimeTokenTableName
  ? DynamoDBDocumentClient.from(new DynamoDBClient({}))
  : null;

export const handler = createMessageLinkHandler({
  tableConfigured: Boolean(runtimeMessageLinkDb && runtimeTokenTableName),
  lookupToken: async (token: string) => {
    if (!runtimeMessageLinkDb || !runtimeTokenTableName) return null;
    const result = await runtimeMessageLinkDb.send(
      new GetCommand({
        TableName: runtimeTokenTableName,
        Key: { token },
      }),
    );
    return (result?.Item as MessageLinkLookupResult | undefined) ?? null;
  },
  nowEpochSeconds,
});
