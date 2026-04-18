import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createQuoContact,
  listQuoContactCustomFields,
  listQuoContacts,
  sendQuoTextMessage,
  updateQuoContact,
} from './quo-client.ts';

test('sendQuoTextMessage posts to Quo with raw API key auth', async () => {
  const originalFetch = globalThis.fetch;
  let request: { url: string; init: RequestInit | undefined } | null = null;

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    request = { url: String(url), init };
    return new Response(
      JSON.stringify({
        data: {
          id: 'MSG123',
          status: 'queued',
        },
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }) as typeof fetch;

  try {
    const result = await sendQuoTextMessage({
      apiKey: 'quo_test_key',
      fromPhoneNumberId: 'PNidOReTRw',
      toE164: '+16173062716',
      content: 'Hello from Test Upholstery',
      userId: 'USqKcpjD6K',
    });

    assert.deepEqual(result, { id: 'MSG123', status: 'queued' });
    assert.ok(request);
    const capturedRequest = request as { url: string; init: RequestInit | undefined };
    assert.equal(capturedRequest.url, 'https://api.openphone.com/v1/messages');
    assert.equal(capturedRequest.init?.method, 'POST');
    assert.equal(
      (capturedRequest.init?.headers as Record<string, string>).Authorization,
      'quo_test_key',
    );

    const body = JSON.parse(String(capturedRequest.init?.body)) as {
      content: string;
      from: string;
      to: string[];
      userId?: string;
    };
    assert.equal(body.from, 'PNidOReTRw');
    assert.deepEqual(body.to, ['+16173062716']);
    assert.equal(body.userId, 'USqKcpjD6K');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendQuoTextMessage rejects invalid phone number IDs before sending', async () => {
  await assert.rejects(
    sendQuoTextMessage({
      apiKey: 'quo_test_key',
      fromPhoneNumberId: 'not-a-phone-number-id',
      toE164: '+16173062716',
      content: 'Hello from Test Upholstery',
    }),
    /must start with PN/,
  );
});

test('Quo contact helpers list fields, list contacts, and create/update contacts', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const responses = [
    new Response(
      JSON.stringify({
        data: [{ key: 'lead_tags', name: 'Lead Tags', type: 'multi-select' }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
    new Response(
      JSON.stringify({
        data: [
          {
            id: 'CT_123',
            source: 'test-upholstery-web',
            externalId: 'test-upholstery:phone:+16173062716',
            customFields: [{ key: 'lead_tags', value: ['Chat Lead'] }],
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
    new Response(
      JSON.stringify({
        data: {
          id: 'CT_123',
          source: 'test-upholstery-web',
          externalId: 'test-upholstery:phone:+16173062716',
          customFields: [{ key: 'lead_tags', value: ['Form Lead'] }],
        },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    ),
    new Response(
      JSON.stringify({
        data: {
          id: 'CT_123',
          source: 'test-upholstery-web',
          externalId: 'test-upholstery:phone:+16173062716',
          customFields: [{ key: 'lead_tags', value: ['Form Lead', 'Chat Lead'] }],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  ];

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected fetch');
    return next;
  }) as typeof fetch;

  try {
    const customFields = await listQuoContactCustomFields({ apiKey: 'quo_test_key' });
    const contacts = await listQuoContacts({
      apiKey: 'quo_test_key',
      externalIds: ['test-upholstery:phone:+16173062716'],
      sources: ['test-upholstery-web'],
      maxResults: 5,
    });
    const created = await createQuoContact({
      apiKey: 'quo_test_key',
      payload: {
        source: 'test-upholstery-web',
        externalId: 'test-upholstery:phone:+16173062716',
        defaultFields: {
          phoneNumbers: [{ name: 'mobile', value: '+16173062716' }],
        },
        customFields: [{ key: 'lead_tags', value: ['Form Lead'] }],
      },
    });
    const updated = await updateQuoContact({
      apiKey: 'quo_test_key',
      contactId: 'CT_123',
      payload: {
        source: 'test-upholstery-web',
        externalId: 'test-upholstery:phone:+16173062716',
        defaultFields: {
          phoneNumbers: [{ name: 'mobile', value: '+16173062716' }],
        },
        customFields: [{ key: 'lead_tags', value: ['Form Lead', 'Chat Lead'] }],
      },
    });

    assert.deepEqual(customFields, [{ key: 'lead_tags', name: 'Lead Tags', type: 'multi-select' }]);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0]?.id, 'CT_123');
    assert.deepEqual(contacts[0]?.customFields[0]?.value, ['Chat Lead']);
    assert.equal(created.id, 'CT_123');
    assert.equal(updated.id, 'CT_123');
    assert.match(requests[1]?.url ?? '', /externalIds=test-upholstery%3Aphone%3A%2B16173062716/);
    assert.match(requests[1]?.url ?? '', /sources=test-upholstery-web/);
    assert.equal(requests[2]?.init?.method, 'POST');
    assert.equal(requests[3]?.init?.method, 'PATCH');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
