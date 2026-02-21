import http from 'node:http';
import { randomUUID } from 'node:crypto';

import OpenAI from 'openai';
import { computeShopState } from '../shared/shop-hours.js';

const port = Number.parseInt(process.env.CHATKIT_DEV_PORT ?? '8787', 10);
const workflowId = process.env.CHATKIT_WORKFLOW_ID;
const apiKey = process.env.OPENAI_API_KEY;

if (!workflowId) {
  console.error('Missing CHATKIT_WORKFLOW_ID in env (.env.local).');
}
if (!apiKey) {
  console.error('Missing OPENAI_API_KEY in env (.env.local).');
}

const openai = new OpenAI({ apiKey });

const SHOP_TIMEZONE = 'America/Los_Angeles';

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  // Vite dev proxy uses same-origin, but CORS makes direct calls easier.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return (async () => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (!chunks.length) return Buffer.alloc(0);
    return Buffer.concat(chunks);
  })();
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function normalizeHeaders(req) {
  const result = {};
  for (const [key, value] of Object.entries(req.headers ?? {})) {
    if (Array.isArray(value)) {
      if (value[0]) result[key.toLowerCase()] = String(value[0]);
      continue;
    }
    if (value != null) {
      result[key.toLowerCase()] = String(value);
    }
  }
  return result;
}

async function parseAttachmentFromRequest(req) {
  const headers = normalizeHeaders(req);
  const contentType = headers['content-type'];
  if (!contentType || !contentType.toLowerCase().startsWith('multipart/form-data')) {
    return { error: 'Expected multipart/form-data' };
  }

  const body = await readBody(req);
  const request = new Request('https://chatkit.local/attachment', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });

  const formData = await request.formData();
  const candidate = formData.get('file') ?? formData.get('files');
  const file = candidate instanceof File ? candidate : null;
  if (!file) {
    return { error: 'No file uploaded. Include a file in field "file".' };
  }

  const mimeType = file.type || 'application/octet-stream';
  const allowed = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
  ]);
  if (!allowed.has(mimeType)) {
    return { error: `Unsupported mime type: ${mimeType}` };
  }

  const bodyBytes = Buffer.from(await file.arrayBuffer());
  if (bodyBytes.length > 8_000_000) {
    return { error: 'Attachment too large.' };
  }

  const rawName =
    typeof file.name === 'string' && file.name.trim() ? file.name.trim() : 'chat-attachment';
  const safeName = rawName.replace(/[<>:"/\\|?*]/g, '_').slice(0, 200);
  return {
    fileId: `att_${randomUUID()}`,
    name: safeName,
    mimeType,
    bodyBase64: bodyBytes.toString('base64'),
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.end();
      return;
    }

    if (
      (url.pathname === '/api/chatkit/session' || url.pathname === '/api/chatkit/session/') &&
      req.method === 'POST'
    ) {
      if (!workflowId || !apiKey) {
        json(res, 500, { error: 'Server missing OPENAI_API_KEY or CHATKIT_WORKFLOW_ID' });
        return;
      }

      const payload = await readJson(req);
      const locale = typeof payload.locale === 'string' ? payload.locale : 'en';
      const pageUrl = typeof payload.pageUrl === 'string' ? payload.pageUrl : '';
      const user = typeof payload.user === 'string' ? payload.user : 'anonymous';
      const shopState = computeShopState(new Date(), SHOP_TIMEZONE);

      try {
        const session = await openai.beta.chatkit.sessions.create({
          user,
          workflow: {
            id: workflowId,
            state_variables: {
              locale,
              page_url: pageUrl,
              ...shopState,
            },
          },
        });

        json(res, 200, { client_secret: session.client_secret });
      } catch (err) {
        console.error('ChatKit session create failed', err?.status, err?.message);
        json(res, 500, { error: 'Failed to create ChatKit session' });
      }
      return;
    }

    if (
      (url.pathname === '/api/chatkit/attachment' || url.pathname === '/api/chatkit/attachment/') &&
      req.method === 'POST'
    ) {
      try {
        const parsed = await parseAttachmentFromRequest(req);
        if (parsed?.error) {
          json(res, 400, { error: parsed.error });
          return;
        }

        const previewUrl = `data:${parsed.mimeType};base64,${parsed.bodyBase64}`;
        json(res, 200, {
          id: parsed.fileId,
          name: parsed.name,
          type: 'image',
          mime_type: parsed.mimeType,
          preview_url: previewUrl,
        });
      } catch (err) {
        console.error('ChatKit dev attachment upload failed', err);
        json(res, 500, { error: 'Failed to parse attachment payload.' });
      }
      return;
    }

    if (
      (url.pathname === '/api/chatkit/lead' || url.pathname === '/api/chatkit/lead/') &&
      req.method === 'POST'
    ) {
      // Local dev helper: accept the request so the UI can be exercised without SES.
      json(res, 200, { ok: true, sent: false, reason: 'dev_noop' });
      return;
    }

    json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    json(res, 500, { error: 'Server error' });
  }
});

server.listen(port, () => {
  console.log(`ChatKit dev API listening on http://localhost:${port}`);
});
