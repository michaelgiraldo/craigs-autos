import { randomUUID } from 'node:crypto';
import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const PROD_MESSAGE_LINK_BASE_URL = 'https://craigs.autos';
const LOCAL_DEV_DEFAULT_BASE_URL = 'http://localhost:4321';

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function inferMessageLinkBaseUrl(pageHref: string | null): string {
  // Route production links through the primary site so `/message` stays channel-agnostic.
  // In local dev, keep links on the same origin so `/message` works on localhost.
  try {
    const url = pageHref ? new URL(pageHref) : null;
    const hostname = url?.hostname ?? '';
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return url?.origin ?? LOCAL_DEV_DEFAULT_BASE_URL;
    }
  } catch {
    // ignore
  }
  return PROD_MESSAGE_LINK_BASE_URL;
}

export function withLinkChannel(link: string, channel: string): string | null {
  const safeLink = safeHttpUrl(link);
  if (!safeLink) return null;
  try {
    const url = new URL(safeLink);
    url.searchParams.set('channel', channel);
    return url.toString();
  } catch {
    return null;
  }
}

export function buildMessageLinkTokenUrl(baseUrl: string, token: string): string {
  const normalizedBase = safeHttpUrl(baseUrl) ?? PROD_MESSAGE_LINK_BASE_URL;
  return joinUrl(normalizedBase, `/message/?token=${encodeURIComponent(token)}`);
}

export type MessageLinkKind = 'customer' | 'draft';

type MessageLinkTokenRecord = {
  token: string;
  thread_id: string;
  kind: MessageLinkKind;
  to_phone: string;
  body: string;
  created_at: number;
  ttl: number;
};

export async function createMessageLinkUrl(args: {
  messageLinkDb: DynamoDBDocumentClient | null;
  messageLinkTokenTableName: string | undefined;
  threadId: string;
  kind: MessageLinkKind;
  toPhone: string;
  body: string;
  baseUrl: string;
  ttlDays: number;
  nowEpochSeconds: () => number;
}): Promise<string | null> {
  if (!args.messageLinkDb || !args.messageLinkTokenTableName) return null;

  const now = args.nowEpochSeconds();
  const token = randomUUID();
  const record: MessageLinkTokenRecord = {
    token,
    thread_id: args.threadId,
    kind: args.kind,
    to_phone: args.toPhone,
    body: args.body ?? '',
    created_at: now,
    ttl: now + args.ttlDays * 24 * 60 * 60,
  };

  try {
    await args.messageLinkDb.send(
      new PutCommand({
        TableName: args.messageLinkTokenTableName,
        Item: record,
        ConditionExpression: 'attribute_not_exists(#token)',
        ExpressionAttributeNames: { '#token': 'token' },
      }),
    );
  } catch (err: any) {
    console.error('Failed to write message link token', err?.name, err?.message);
    return null;
  }

  // Use a query param so the landing page can stay fully static (Astro SSG).
  return buildMessageLinkTokenUrl(args.baseUrl, token);
}
