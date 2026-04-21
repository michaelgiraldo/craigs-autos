import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLeadFollowupWorkerEvent } from './event.ts';

test('parseLeadFollowupWorkerEvent trims valid idempotency keys', () => {
  assert.deepEqual(parseLeadFollowupWorkerEvent({ idempotency_key: ' form:followup-work-1 ' }), {
    ok: true,
    idempotencyKey: 'form:followup-work-1',
  });
});

test('parseLeadFollowupWorkerEvent rejects missing idempotency keys', () => {
  assert.deepEqual(parseLeadFollowupWorkerEvent({}), {
    ok: false,
    reason: 'missing_idempotency_key',
  });
  assert.deepEqual(parseLeadFollowupWorkerEvent({ idempotency_key: '   ' }), {
    ok: false,
    reason: 'missing_idempotency_key',
  });
});
