import assert from 'node:assert/strict';
import test from 'node:test';
import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';
import {
  getChatHandoffEventForStatus,
  isCompletedChatHandoffStatus,
} from '../../../src/components/chatwidget/handoff-status.ts';

test('frontend chat handoff statuses map accepted states to completed analytics', () => {
  for (const status of ['accepted', 'already_accepted', 'worker_completed']) {
    assert.equal(isCompletedChatHandoffStatus(status), true);
    assert.equal(getChatHandoffEventForStatus(status), LEAD_EVENTS.chatHandoffCompleted);
  }
});

test('frontend chat handoff statuses map blocked and deferred distinctly', () => {
  assert.equal(getChatHandoffEventForStatus('blocked'), LEAD_EVENTS.chatHandoffBlocked);
  assert.equal(getChatHandoffEventForStatus('deferred'), LEAD_EVENTS.chatHandoffDeferred);
  assert.equal(getChatHandoffEventForStatus('unexpected'), LEAD_EVENTS.chatHandoffError);
});

test('frontend chat handoff status keeps worker failures out of completed analytics', () => {
  assert.equal(isCompletedChatHandoffStatus('worker_failed'), false);
  assert.equal(getChatHandoffEventForStatus('worker_failed'), LEAD_EVENTS.chatHandoffError);
});
