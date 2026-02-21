import assert from 'node:assert/strict';
import test from 'node:test';
import { createLeadSignalHandler } from './handler.ts';

test('lead-signal handler rejects invalid events', async () => {
  const handler = createLeadSignalHandler({
    configValid: true,
    nowEpochSeconds: () => 1_000,
    writeRecord: async () => undefined,
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({
      event: 'not_a_real_event',
      pageUrl: 'https://craigs.autos/en/',
    }),
  });

  assert.equal(result.statusCode, 400);
  assert.match(result.body, /Invalid event/);
});

test('lead-signal handler writes record for valid payload', async () => {
  const writes: Array<Record<string, unknown>> = [];
  const handler = createLeadSignalHandler({
    configValid: true,
    nowEpochSeconds: () => 1_000,
    writeRecord: async (record) => {
      writes.push(record);
    },
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({
      event: 'lead_click_to_call',
      pageUrl: 'https://craigs.autos/en/contact/?gclid=test-gclid',
      user: 'anon_123',
      locale: 'en',
      clickUrl: 'tel:+14083793820',
      provider: 'google_ads',
      attribution: {
        utm_source: 'google',
      },
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].lead_method, 'lead_click_to_call');
  assert.equal(writes[0].utm_source, 'google');
  assert.equal(writes[0].user_id, 'anon_123');
});

test('lead-signal handler returns 500 when configuration is missing', async () => {
  const handler = createLeadSignalHandler({
    configValid: false,
    nowEpochSeconds: () => 1_000,
    writeRecord: async () => undefined,
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({ event: 'lead_click_to_call' }),
  });

  assert.equal(result.statusCode, 500);
});
