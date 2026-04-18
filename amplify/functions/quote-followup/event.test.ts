import assert from 'node:assert/strict';
import test from 'node:test';
import { parseQuoteFollowupEvent } from './event.ts';

test('parseQuoteFollowupEvent trims valid submission ids', () => {
  assert.deepEqual(parseQuoteFollowupEvent({ submission_id: ' submission-1 ' }), {
    ok: true,
    submissionId: 'submission-1',
  });
});

test('parseQuoteFollowupEvent rejects missing submission ids', () => {
  assert.deepEqual(parseQuoteFollowupEvent({}), {
    ok: false,
    reason: 'missing_submission_id',
  });
  assert.deepEqual(parseQuoteFollowupEvent({ submission_id: '   ' }), {
    ok: false,
    reason: 'missing_submission_id',
  });
});
