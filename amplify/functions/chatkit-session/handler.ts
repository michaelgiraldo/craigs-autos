import OpenAI from 'openai';

const workflowId = process.env.CHATKIT_WORKFLOW_ID;
const apiKey = process.env.OPENAI_API_KEY;

const openai = apiKey ? new OpenAI({ apiKey }) : null;

const ALLOWED_ORIGINS = new Set([
  'https://chat.craigs.autos',
  'https://craigs.autos',
  'http://localhost:4321',
]);

function getOrigin(headers) {
  if (!headers || typeof headers !== 'object') return undefined;
  return headers.origin ?? headers.Origin;
}

function corsHeaders(origin) {
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

function json(statusCode, body, origin) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
    body: JSON.stringify(body),
  };
}

function decodeBody(event) {
  const raw = event?.body;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (event?.isBase64Encoded) {
    return Buffer.from(raw, 'base64').toString('utf8');
  }
  return raw;
}

export const handler = async (event) => {
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

  let payload = {};
  try {
    const body = decodeBody(event);
    payload = body ? JSON.parse(body) : {};
  } catch {
    return json(400, { error: 'Invalid JSON body' }, origin);
  }

  const locale = typeof payload?.locale === 'string' ? payload.locale : 'en';
  const pageUrl = typeof payload?.pageUrl === 'string' ? payload.pageUrl : '';
  const user = typeof payload?.user === 'string' ? payload.user : 'anonymous';

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
  } catch (err) {
    console.error('ChatKit session create failed', err?.status, err?.message);
    return json(500, { error: 'Failed to create ChatKit session' }, origin);
  }
};

