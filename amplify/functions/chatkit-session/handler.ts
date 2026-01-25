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

function json(statusCode: number, body: unknown): LambdaResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
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

  if (method === 'OPTIONS') {
    // Lambda Function URL CORS handles the browser preflight automatically.
    return {
      statusCode: 204,
      headers: {},
      body: '',
    };
  }

  if (method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  if (!workflowId || !apiKey || !openai) {
    return json(500, { error: 'Server missing configuration' });
  }

  let payload: ChatkitSessionRequest = {};
  try {
    const body = decodeBody(event);
    const parsed = body ? JSON.parse(body) : {};
    payload = parsed && typeof parsed === 'object' ? (parsed as ChatkitSessionRequest) : {};
  } catch {
    return json(400, { error: 'Invalid JSON body' });
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

    return json(200, { client_secret: session.client_secret });
  } catch (err: any) {
    console.error('ChatKit session create failed', err?.status, err?.message);
    return json(500, { error: 'Failed to create ChatKit session' });
  }
};
