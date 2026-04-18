import http from 'node:http';

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

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
      (url.pathname === '/api/chat/session' || url.pathname === '/api/chat/session/') &&
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
      (url.pathname === '/api/chat/handoff' || url.pathname === '/api/chat/handoff/') &&
      req.method === 'POST'
    ) {
      // Local dev helper: accept the request so the UI can exercise the handoff path.
      json(res, 200, { ok: true, completed: false, reason: 'dev_noop' });
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
