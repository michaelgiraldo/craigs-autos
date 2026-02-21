import assert from 'node:assert/strict';
import test from 'node:test';
import { createMessageLinkHandler } from './handler.ts';

const VALID_TOKEN = '11111111-2222-4333-8444-555555555555';

test('message-link handler returns missing_token when token is absent', async () => {
  const handler = createMessageLinkHandler({
    tableConfigured: true,
    lookupToken: async () => null,
    nowEpochSeconds: () => 1_000,
  });

  const result = await handler({
    requestContext: { http: { method: 'GET' } },
    rawQueryString: '',
  });

  assert.equal(result.statusCode, 400);
  assert.match(result.body, /missing_token/);
});

test('message-link handler returns invalid_token for malformed token', async () => {
  const handler = createMessageLinkHandler({
    tableConfigured: true,
    lookupToken: async () => null,
    nowEpochSeconds: () => 1_000,
  });

  const result = await handler({
    requestContext: { http: { method: 'GET' } },
    rawQueryString: 'token=abc',
  });

  assert.equal(result.statusCode, 400);
  assert.match(result.body, /invalid_token/);
});

test('message-link handler returns expired for stale records', async () => {
  const handler = createMessageLinkHandler({
    tableConfigured: true,
    lookupToken: async () => ({
      ttl: 100,
      to_phone: '+14081234567',
      body: 'Hi there',
    }),
    nowEpochSeconds: () => 200,
  });

  const result = await handler({
    requestContext: { http: { method: 'GET' } },
    rawQueryString: `token=${encodeURIComponent(VALID_TOKEN)}`,
  });

  assert.equal(result.statusCode, 410);
  assert.match(result.body, /expired/);
});

test('message-link handler returns payload for valid token', async () => {
  const handler = createMessageLinkHandler({
    tableConfigured: true,
    lookupToken: async () => ({
      ttl: 5_000,
      to_phone: '+14081234567',
      body: 'Hello from test',
    }),
    nowEpochSeconds: () => 100,
  });

  const result = await handler({
    requestContext: { http: { method: 'GET' } },
    rawQueryString: `token=${encodeURIComponent(VALID_TOKEN)}`,
  });

  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body) as { ok: boolean; to_phone: string; body: string };
  assert.equal(body.ok, true);
  assert.equal(body.to_phone, '+14081234567');
  assert.equal(body.body, 'Hello from test');
});
