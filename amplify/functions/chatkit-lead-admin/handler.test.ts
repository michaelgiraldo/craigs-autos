import assert from 'node:assert/strict';
import test from 'node:test';
import { createLeadAdminHandler } from './handler.ts';

function authHeader(password: string) {
  return `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;
}

test('lead-admin handler rejects unauthorized requests', async () => {
  const handler = createLeadAdminHandler({
    configValid: true,
    adminPassword: 'secret',
    scanLeads: async () => ({ items: [] }),
    updateLead: async () => undefined,
    nowEpochSeconds: () => 1_000,
  });

  const result = await handler({
    requestContext: { http: { method: 'GET' } },
    headers: {},
  });

  assert.equal(result.statusCode, 401);
});

test('lead-admin handler returns sorted leads for authorized GET', async () => {
  const handler = createLeadAdminHandler({
    configValid: true,
    adminPassword: 'secret',
    scanLeads: async () => ({
      items: [
        { lead_id: 'older', created_at: 10, qualified: false },
        { lead_id: 'newer', created_at: 20, qualified: true },
      ],
      lastEvaluatedKey: { lead_id: 'cursor-id' },
    }),
    updateLead: async () => undefined,
    nowEpochSeconds: () => 1_000,
  });

  const result = await handler({
    requestContext: { http: { method: 'GET' } },
    headers: { authorization: authHeader('secret') },
  });

  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body) as { items: Array<{ lead_id: string }> };
  assert.deepEqual(
    body.items.map((item) => item.lead_id),
    ['newer', 'older'],
  );
});

test('lead-admin handler validates POST payload', async () => {
  const handler = createLeadAdminHandler({
    configValid: true,
    adminPassword: 'secret',
    scanLeads: async () => ({ items: [] }),
    updateLead: async () => undefined,
    nowEpochSeconds: () => 1_000,
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    headers: { authorization: authHeader('secret') },
    body: JSON.stringify({ lead_id: '', qualified: 'yes' }),
  });

  assert.equal(result.statusCode, 400);
  assert.match(result.body, /Missing lead_id/);
});

test('lead-admin handler updates lead for authorized POST', async () => {
  const updates: Array<{ leadId: string; qualified: boolean; qualifiedAt: number }> = [];

  const handler = createLeadAdminHandler({
    configValid: true,
    adminPassword: 'secret',
    scanLeads: async () => ({ items: [] }),
    updateLead: async (args) => {
      updates.push(args);
    },
    nowEpochSeconds: () => 1_234,
  });

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    headers: { authorization: authHeader('secret') },
    body: JSON.stringify({ lead_id: 'lead-123', qualified: true }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    leadId: 'lead-123',
    qualified: true,
    qualifiedAt: 1_234,
  });
});
