import assert from 'node:assert/strict';
import test from 'node:test';
import { handler } from './handler.ts';

test('attachment-upload handler rejects unsupported methods', async () => {
  const result = await handler({
    requestContext: { http: { method: 'DELETE' } },
  });

  assert.equal(result.statusCode, 405);
  assert.match(result.body, /Method not allowed/);
});

test('attachment-upload handler requires attachment id for GET', async () => {
  const result = await handler({
    requestContext: { http: { method: 'GET' } },
    rawQueryString: '',
  });

  assert.equal(result.statusCode, 400);
  assert.match(result.body, /Missing attachment id/);
});
