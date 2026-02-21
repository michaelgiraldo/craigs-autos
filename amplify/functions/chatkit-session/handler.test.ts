import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatkitSessionHandler } from './handler.ts';

test('session handler rejects non-POST methods', async () => {
  const handler = createChatkitSessionHandler({
    hasValidConfig: true,
    workflowId: 'wf_test',
    chatkitClient: null,
    shopTimezone: 'America/Los_Angeles',
  });

  const result = await handler({
    requestContext: { http: { method: 'GET' } },
  });

  assert.equal(result.statusCode, 405);
});

test('session handler validates request payload', async () => {
  const handler = createChatkitSessionHandler({
    hasValidConfig: true,
    workflowId: 'wf_test',
    chatkitClient: {
      beta: {
        chatkit: {
          sessions: {
            create: async () => ({ client_secret: 'secret' }),
          },
        },
      },
    },
    shopTimezone: 'America/Los_Angeles',
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({ locale: 123 }),
  });

  assert.equal(result.statusCode, 400);
  assert.match(result.body, /Invalid request payload/);
});

test('session handler returns 500 when config is invalid', async () => {
  const handler = createChatkitSessionHandler({
    hasValidConfig: false,
    workflowId: '',
    chatkitClient: null,
    shopTimezone: 'America/Los_Angeles',
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: '{}',
  });

  assert.equal(result.statusCode, 500);
});

test('session handler creates chatkit session on valid payload', async () => {
  const captured: unknown[] = [];
  const handler = createChatkitSessionHandler({
    hasValidConfig: true,
    workflowId: 'wf_test',
    chatkitClient: {
      beta: {
        chatkit: {
          sessions: {
            create: async (args) => {
              captured.push(args);
              return { client_secret: 'cksess_secret' };
            },
          },
        },
      },
    },
    shopTimezone: 'America/Los_Angeles',
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({
      locale: 'es',
      pageUrl: 'https://craigs.autos/es/contact/',
      user: 'anon_123',
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(captured.length, 1);
  const createInput = captured[0] as any;
  assert.equal(createInput.workflow.id, 'wf_test');
  assert.equal(createInput.workflow.state_variables.locale, 'es');
  assert.equal(createInput.workflow.state_variables.page_url, 'https://craigs.autos/es/contact/');
  assert.equal(createInput.user, 'anon_123');
});
