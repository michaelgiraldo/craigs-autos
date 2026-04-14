import assert from 'node:assert/strict';
import test from 'node:test';
import { applyJourneyStatusTransition, mergeJourneyStatus } from './shared.ts';

test('mergeJourneyStatus preserves stronger terminal states', () => {
  assert.equal(mergeJourneyStatus('qualified', 'active'), 'qualified');
  assert.equal(mergeJourneyStatus('verified', 'captured'), 'verified');
  assert.equal(mergeJourneyStatus('captured', 'qualified'), 'qualified');
  assert.equal(mergeJourneyStatus('archived', 'captured'), 'archived');
});

test('mergeJourneyStatus allows non-terminal journeys to move forward again', () => {
  assert.equal(mergeJourneyStatus('incomplete', 'active'), 'active');
  assert.equal(mergeJourneyStatus('active', 'incomplete'), 'incomplete');
});

test('applyJourneyStatusTransition preserves reason when a weaker status is ignored', () => {
  assert.deepEqual(
    applyJourneyStatusTransition({
      currentStatus: 'captured',
      currentReason: null,
      incomingStatus: 'incomplete',
      incomingReason: 'missing_contact',
    }),
    {
      journeyStatus: 'captured',
      statusReason: null,
    },
  );
});

test('applyJourneyStatusTransition updates reason when the stronger incoming status wins', () => {
  assert.deepEqual(
    applyJourneyStatusTransition({
      currentStatus: 'captured',
      currentReason: null,
      incomingStatus: 'qualified',
      incomingReason: 'qualified_in_admin',
    }),
    {
      journeyStatus: 'qualified',
      statusReason: 'qualified_in_admin',
    },
  );
});
