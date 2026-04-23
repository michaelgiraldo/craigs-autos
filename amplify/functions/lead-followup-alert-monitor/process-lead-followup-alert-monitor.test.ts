import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLeadFollowupWorkItem,
  type LeadFollowupFailureAlertKind,
  type LeadFollowupWorkItem,
  type LeadFollowupWorkStatus,
} from '../_lead-platform/domain/lead-followup-work.ts';
import {
  processLeadFollowupAlertMonitor,
  type LeadFollowupAlertMonitorDeps,
} from './process-lead-followup-alert-monitor.ts';

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
    lead_record_id: 'lead-1',
    journey_id: 'journey-1',
    ...overrides,
  };
}

function createDeps(
  overrides: Partial<LeadFollowupAlertMonitorDeps> = {},
): LeadFollowupAlertMonitorDeps {
  return {
    batchSize: 25,
    configValid: true,
    getFollowupWork: async () => null,
    listFollowupWorkByStatus: async () => [],
    minIntervalSeconds: 3_600,
    nowEpochSeconds: () => 2_000,
    sendFailureAlertEmail: async () => ({ messageId: 'ses-message-1' }),
    updateFailureAlertState: async () => true,
    ...overrides,
  };
}

test('processLeadFollowupAlertMonitor sends one alert for a new errored work item', async () => {
  const updateCalls: Array<{
    alertKind: Exclude<LeadFollowupFailureAlertKind, null>;
    alertStatus: 'sent' | 'failed';
    idempotencyKey: string;
  }> = [];
  const deps = createDeps({
    listFollowupWorkByStatus: async (status) =>
      status === 'error'
        ? [
            makeRecord({
              customer_email_error: 'SES send failed',
              status: 'error',
            }),
          ]
        : [],
    updateFailureAlertState: async (args) => {
      updateCalls.push({
        alertKind: args.alertKind,
        alertStatus: args.alertStatus,
        idempotencyKey: args.idempotencyKey,
      });
      return true;
    },
  });

  const result = await processLeadFollowupAlertMonitor({ deps });

  assert.equal(result.sent, 1);
  assert.equal(result.sendFailed, 0);
  assert.deepEqual(result.items, [
    {
      alertKind: 'error',
      idempotencyKey: 'form:followup-1',
      result: 'sent',
    },
  ]);
  assert.deepEqual(updateCalls, [
    {
      alertKind: 'error',
      alertStatus: 'sent',
      idempotencyKey: 'form:followup-1',
    },
  ]);
});

test('processLeadFollowupAlertMonitor records failed alert sends without re-driving the workflow', async () => {
  const updateCalls: Array<{ alertStatus: 'sent' | 'failed'; idempotencyKey: string }> = [];
  const deps = createDeps({
    listFollowupWorkByStatus: async (status) =>
      status === 'error'
        ? [
            makeRecord({
              customer_email_error: 'SES send failed',
              status: 'error',
            }),
          ]
        : [],
    sendFailureAlertEmail: async () => {
      throw new Error('SES unavailable');
    },
    updateFailureAlertState: async (args) => {
      updateCalls.push({
        alertStatus: args.alertStatus,
        idempotencyKey: args.idempotencyKey,
      });
      return true;
    },
  });

  const result = await processLeadFollowupAlertMonitor({ deps });

  assert.equal(result.sent, 0);
  assert.equal(result.sendFailed, 1);
  assert.equal(result.items[0]?.result, 'send_failed');
  assert.deepEqual(updateCalls, [
    {
      alertStatus: 'failed',
      idempotencyKey: 'form:followup-1',
    },
  ]);
});

test('processLeadFollowupAlertMonitor skips completed, already-alerted, and cooling-down records', async () => {
  const queuedRecord = makeRecord({
    failure_alert_last_attempt_at: 1_900,
    failure_alert_status: 'failed',
    idempotency_key: 'form:followup-queued',
    source_event_id: 'followup-queued',
    status: 'queued',
    updated_at: 1_300,
  });
  const processingRecord = makeRecord({
    failure_alert_sent_at: 1_800,
    failure_alert_status: 'sent',
    idempotency_key: 'form:followup-processing',
    lock_expires_at: 1_900,
    source_event_id: 'followup-processing',
    status: 'processing',
  });
  const deps = createDeps({
    listFollowupWorkByStatus: async (status: LeadFollowupWorkStatus) => {
      if (status === 'error')
        return [makeRecord({ idempotency_key: 'completed-1', status: 'completed' })];
      if (status === 'queued') return [queuedRecord];
      if (status === 'processing') return [processingRecord];
      return [];
    },
  });

  const result = await processLeadFollowupAlertMonitor({ deps });

  assert.deepEqual(
    result.items.map((item) => item.result),
    ['skipped_not_alertable', 'skipped_cooling_down', 'skipped_already_sent'],
  );
});
