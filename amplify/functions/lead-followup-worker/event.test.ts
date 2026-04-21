import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLeadFollowupWorkerEvent } from './event.ts';

test('parseLeadFollowupWorkerEvent trims valid follow-up work ids', () => {
  assert.deepEqual(parseLeadFollowupWorkerEvent({ followup_work_id: ' followup-work-1 ' }), {
    ok: true,
    followupWorkId: 'followup-work-1',
  });
});

test('parseLeadFollowupWorkerEvent rejects missing follow-up work ids', () => {
  assert.deepEqual(parseLeadFollowupWorkerEvent({}), {
    ok: false,
    reason: 'missing_followup_work_id',
  });
  assert.deepEqual(parseLeadFollowupWorkerEvent({ followup_work_id: '   ' }), {
    ok: false,
    reason: 'missing_followup_work_id',
  });
});
