import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createQuoDestinationSyncProvider,
  createQuoMessagingProvider,
  getQuoDestinationSyncReadiness,
  getQuoMessagingReadiness,
  type QuoProviderConfig,
} from './quo-provider.ts';

function makeConfig(overrides: Partial<QuoProviderConfig> = {}): QuoProviderConfig {
  return {
    apiKey: 'quo_test_key',
    enabled: true,
    fromPhoneNumberId: 'PNabc123',
    userId: 'USabc123',
    contactSource: 'craigs-auto-upholstery-web',
    contactExternalIdPrefix: 'craigs-auto-upholstery',
    leadTagsFieldKey: 'lead_tags',
    leadTagsFieldName: 'Lead Tags',
    ...overrides,
  };
}

test('getQuoMessagingReadiness reports disabled and missing config precisely', () => {
  const disabled = getQuoMessagingReadiness(makeConfig({ enabled: false }));
  assert.equal(disabled.ready, false);
  assert.deepEqual(
    disabled.issues.map((issue) => issue.code),
    ['provider_disabled'],
  );

  const missing = getQuoMessagingReadiness(
    makeConfig({ apiKey: '', fromPhoneNumberId: '', userId: 'bad-user' }),
  );
  assert.equal(missing.ready, false);
  assert.deepEqual(
    missing.issues.map((issue) => issue.code),
    ['missing_api_key', 'missing_sender_id', 'invalid_user_id'],
  );
});

test('getQuoMessagingReadiness treats unresolved Amplify secret placeholders as missing', () => {
  const readiness = getQuoMessagingReadiness(
    makeConfig({ apiKey: '<value will be resolved during runtime>' }),
  );

  assert.equal(readiness.ready, false);
  assert.deepEqual(
    readiness.issues.map((issue) => issue.code),
    ['missing_api_key'],
  );
});

test('getQuoMessagingReadiness rejects invalid Quo identifiers', () => {
  const readiness = getQuoMessagingReadiness(
    makeConfig({ fromPhoneNumberId: 'OPabc123', userId: 'abc123' }),
  );

  assert.equal(readiness.ready, false);
  assert.deepEqual(
    readiness.issues.map((issue) => issue.code),
    ['invalid_sender_id', 'invalid_user_id'],
  );
});

test('getQuoDestinationSyncReadiness requires contact sync config', () => {
  const readiness = getQuoDestinationSyncReadiness(
    makeConfig({
      contactExternalIdPrefix: '',
      contactSource: '',
      leadTagsFieldKey: '',
      leadTagsFieldName: '',
    }),
  );

  assert.equal(readiness.ready, false);
  assert.deepEqual(
    readiness.issues.map((issue) => issue.code),
    ['missing_contact_source', 'missing_external_id_prefix', 'missing_lead_tags_config'],
  );
});

test('createQuoMessagingProvider sends through the Quo API client when ready', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ data: { id: 'MSG123', status: 'queued' } }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const provider = createQuoMessagingProvider(makeConfig());
    const result = await provider.sendText({
      toE164: '+14083793820',
      body: 'Thanks for reaching out.',
    });

    assert.equal(provider.readiness.ready, true);
    assert.deepEqual(result, { id: 'MSG123', status: 'queued' });
    assert.deepEqual(requestBody, {
      content: 'Thanks for reaching out.',
      from: 'PNabc123',
      to: ['+14083793820'],
      userId: 'USabc123',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createQuoMessagingProvider refuses sends when provider is not ready or SMS is invalid', async () => {
  const notReady = createQuoMessagingProvider(makeConfig({ apiKey: '' }));
  await assert.rejects(
    notReady.sendText({ toE164: '+14083793820', body: 'Hello' }),
    /API key is missing/,
  );

  const ready = createQuoMessagingProvider(makeConfig());
  await assert.rejects(ready.sendText({ toE164: '+14083793820', body: 'x'.repeat(1_601) }), /1600/);
});

test('createQuoDestinationSyncProvider exposes destination-sync readiness', () => {
  const provider = createQuoDestinationSyncProvider(makeConfig());

  assert.equal(provider.provider, 'quo');
  assert.equal(provider.capability, 'destination_sync');
  assert.equal(provider.readiness.ready, true);
});
