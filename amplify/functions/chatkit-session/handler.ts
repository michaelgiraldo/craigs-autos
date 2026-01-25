import OpenAI from 'openai';

const workflowId = process.env.CHATKIT_WORKFLOW_ID;
const apiKey = process.env.OPENAI_API_KEY;

const openai = apiKey ? new OpenAI({ apiKey }) : null;

type LambdaHeaders = Record<string, string | undefined>;

type LambdaEvent = {
  headers?: LambdaHeaders | null;
  requestContext?: { http?: { method?: string } } | null;
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
};

type LambdaResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

type ChatkitSessionRequest = {
  current?: unknown;
  locale?: unknown;
  pageUrl?: unknown;
  user?: unknown;
};

const ALLOWED_ORIGINS = new Set([
  'https://chat.craigs.autos',
  'https://craigs.autos',
  'http://localhost:4321',
]);

function getOrigin(headers: LambdaHeaders | null | undefined): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  return headers.origin ?? headers.Origin ?? undefined;
}

function corsHeaders(origin: string | undefined): Record<string, string> {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (typeof origin === 'string' && ALLOWED_ORIGINS.has(origin)) {
    return {
      ...headers,
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    };
  }

  return { ...headers, 'Access-Control-Allow-Origin': 'null' };
}

function json(statusCode: number, body: unknown, origin: string | undefined): LambdaResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
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

export const handler = async (event: LambdaEvent): Promise<LambdaResult> => {
  const method = event?.requestContext?.http?.method ?? event?.httpMethod;
  const origin = getOrigin(event?.headers);

  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(origin),
      body: '',
    };
  }

  if (method !== 'POST') {
    return json(405, { error: 'Method not allowed' }, origin);
  }

  if (!workflowId || !apiKey || !openai) {
    return json(500, { error: 'Server missing configuration' }, origin);
  }

  let payload: ChatkitSessionRequest = {};
  try {
    const body = decodeBody(event);
    const parsed = body ? JSON.parse(body) : {};
    payload = parsed && typeof parsed === 'object' ? (parsed as ChatkitSessionRequest) : {};
  } catch {
    return json(400, { error: 'Invalid JSON body' }, origin);
  }

  const locale = typeof payload.locale === 'string' ? payload.locale : 'en';
  const pageUrl = typeof payload.pageUrl === 'string' ? payload.pageUrl : '';
  const user = typeof payload.user === 'string' ? payload.user : 'anonymous';

  try {
    const session = await openai.beta.chatkit.sessions.create({
      user,
      workflow: {
        id: workflowId,
        state_variables: {
          locale,
          page_url: pageUrl,
        },
      },
    });

    return json(200, { client_secret: session.client_secret }, origin);
  } catch (err: any) {
    console.error('ChatKit session create failed', err?.status, err?.message);
    return json(500, { error: 'Failed to create ChatKit session' }, origin);
  }
};
