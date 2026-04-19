import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLeadFollowupWorkerEvent } from './event.ts';

test('parseLeadFollowupWorkerEvent trims valid quote request ids', () => {
  assert.deepEqual(parseLeadFollowupWorkerEvent({ quote_request_id: ' quote-request-1 ' }), {
    ok: true,
    quoteRequestId: 'quote-request-1',
  });
});

test('parseLeadFollowupWorkerEvent rejects missing quote request ids', () => {
  assert.deepEqual(parseLeadFollowupWorkerEvent({}), {
    ok: false,
    reason: 'missing_quote_request_id',
  });
  assert.deepEqual(parseLeadFollowupWorkerEvent({ quote_request_id: '   ' }), {
    ok: false,
    reason: 'missing_quote_request_id',
  });
});
