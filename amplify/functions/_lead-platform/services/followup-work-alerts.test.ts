import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLeadFollowupWorkItem,
  type LeadFollowupWorkItem,
} from '../domain/lead-followup-work.ts';
import {
  classifyLeadFollowupAlertKind,
  isLeadFollowupFailureAlertCoolingDown,
  isLeadFollowupFailureAlertSent,
  isLeadFollowupWorkStale,
} from './followup-work-alerts.ts';

function makeRecord(overrides: Partial<LeadFollowupWorkItem> = {}): LeadFollowupWorkItem {
  return {
    ...createLeadFollowupWorkItem({
      attribution: null,
      captureChannel: 'form',
      email: 'alex@example.com',
      followupWorkId: 'followup-1',
      idempotencyKey: 'form:followup-1',
      locale: 'en',
      message: 'Seat tear on driver side bolster.',
      name: 'Alex Customer',
      nowEpochSeconds: 1_000,
      origin: 'https://craigs.autos/en/request-a-quote',
      pageUrl: 'https://craigs.autos/en/request-a-quote',
      phone: '(408) 555-0100',
      service: 'seat repair',
      siteLabel: 'craigs.autos',
      sourceEventId: 'followup-1',
      userId: 'anon-user',
      vehicle: '1969 Camaro',
    }),
    ...overrides,
  };
}

test('classifyLeadFollowupAlertKind identifies terminal errors and stale work', () => {
  assert.equal(
    classifyLeadFollowupAlertKind({
      nowEpochSeconds: 2_000,
      record: makeRecord({ status: 'error' }),
    }),
    'error',
  );
  assert.equal(
    classifyLeadFollowupAlertKind({
      nowEpochSeconds: 2_000,
      record: makeRecord({ status: 'queued', updated_at: 1_399 }),
    }),
    'stale_queued',
  );
  assert.equal(
    classifyLeadFollowupAlertKind({
      nowEpochSeconds: 2_000,
      record: makeRecord({ lock_expires_at: 1_999, status: 'processing' }),
    }),
    'stale_processing',
  );
});

test('alert helpers suppress completed and already-alerted work', () => {
  const completed = makeRecord({ status: 'completed' });
  assert.equal(isLeadFollowupWorkStale({ nowEpochSeconds: 2_000, record: completed }), false);
  assert.equal(isLeadFollowupFailureAlertSent(makeRecord({ failure_alert_status: 'sent' })), true);
  assert.equal(
    isLeadFollowupFailureAlertCoolingDown({
      minIntervalSeconds: 3_600,
      nowEpochSeconds: 2_000,
      record: makeRecord({
        failure_alert_last_attempt_at: 1_500,
        failure_alert_status: 'failed',
      }),
    }),
    true,
  );
});
