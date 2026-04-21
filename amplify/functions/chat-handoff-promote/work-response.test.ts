import assert from 'node:assert/strict';
import test from 'node:test';
import { createLeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import { existingWorkResponse } from './work-response.ts';

function makeWorkItem(status: 'queued' | 'processing' | 'completed' | 'error') {
  return {
    ...createLeadFollowupWorkItem({
      attribution: null,
      captureChannel: 'chat',
      email: 'customer@example.com',
      followupWorkId: 'chat_cthr_123',
      idempotencyKey: 'chat:cthr_123',
      journeyId: 'journey-chat',
      leadRecordId: 'lead-chat',
      locale: 'en',
      message: 'Customer needs upholstery help.',
      name: 'Customer',
      nowEpochSeconds: 1_000,
      origin: 'chat:idle',
      pageUrl: 'https://craigs.autos',
      phone: '',
      service: 'seat repair',
      siteLabel: 'craigs.autos',
      sourceEventId: 'cthr_123',
      userId: 'anon-user',
      vehicle: 'Toyota Camry',
    }),
    status,
  };
}

test('existing chat work response reports in-flight work as already accepted', () => {
  const response = existingWorkResponse(makeWorkItem('processing'));

  assert.equal(response.status, 'already_accepted');
  assert.equal(response.reason, 'followup_in_progress');
  assert.equal(response.followup_work_status, 'processing');
});

test('existing chat work response reports completed work distinctly', () => {
  const response = existingWorkResponse(makeWorkItem('completed'));

  assert.equal(response.status, 'worker_completed');
  assert.equal(response.reason, 'already_completed');
  assert.equal(response.followup_work_status, 'completed');
});

test('existing chat work response reports errored work as failed, not completed', () => {
  const response = existingWorkResponse(makeWorkItem('error'));

  assert.equal(response.status, 'worker_failed');
  assert.equal(response.reason, 'followup_error');
  assert.equal(response.followup_work_status, 'error');
});
