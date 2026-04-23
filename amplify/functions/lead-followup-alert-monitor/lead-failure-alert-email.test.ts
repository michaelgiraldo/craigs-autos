import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLeadFollowupWorkItem,
  type LeadFollowupWorkItem,
} from '../_lead-platform/domain/lead-followup-work.ts';
import { buildLeadFailureAlertEmailContent } from './lead-failure-alert-email.ts';

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

test('buildLeadFailureAlertEmailContent uses ACTION REQUIRED when no customer response was sent', () => {
  const message = buildLeadFailureAlertEmailContent({
    alertKind: 'error',
    record: makeRecord({
      customer_email_error: 'SES send failed',
      status: 'error',
    }),
  });

  assert.match(
    message.subject,
    /^\[Lead Alert\]\[ACTION REQUIRED\]\[form\] Alex Customer - no customer reply sent$/,
  );
  assert.match(message.text, /Customer response sent: no/);
  assert.match(
    message.text,
    /Immediate action: Call or email the customer manually as soon as possible\./,
  );
});

test('buildLeadFailureAlertEmailContent uses STUCK for stale work', () => {
  const message = buildLeadFailureAlertEmailContent({
    alertKind: 'stale_processing',
    record: makeRecord({
      email_status: 'sent',
      status: 'processing',
    }),
  });

  assert.match(
    message.subject,
    /^\[Lead Alert\]\[STUCK\]\[form\] Alex Customer - work item stuck$/,
  );
  assert.match(
    message.text,
    /Failure reason: Work item remained in processing after the worker lease expired\./,
  );
});
