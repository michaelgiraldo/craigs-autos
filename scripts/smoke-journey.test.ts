import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildExpectedIdentifiers,
  buildSyntheticSmokeRequest,
  evaluateFunctionCandidate,
  parseArgs,
} from './smoke-journey.ts';

test('parseArgs reads the supported smoke journey flags', () => {
  const options = parseArgs([
    '--apply',
    '--keep-records',
    '--profile',
    'AdministratorAccess-281934899223',
    '--region',
    'us-west-2',
    '--function-name',
    'quote-request-submit-live',
    '--function-name-contains',
    'custom-pattern',
    '--json',
  ]);

  assert.equal(options.apply, true);
  assert.equal(options.keepRecords, true);
  assert.equal(options.profile, 'AdministratorAccess-281934899223');
  assert.equal(options.region, 'us-west-2');
  assert.equal(options.functionName, 'quote-request-submit-live');
  assert.equal(options.functionNameContains, 'custom-pattern');
  assert.equal(options.json, true);
});

test('buildSyntheticSmokeRequest and identifiers stay deterministic for one run id', () => {
  const request = buildSyntheticSmokeRequest('abc12345');
  const expected = buildExpectedIdentifiers(request);

  assert.equal(request.__smoke_test, true);
  assert.equal(request.journey_id, 'journey_smoke_abc12345');
  assert.equal(expected.clientEventId, 'journey-smoke-abc12345');
  assert.equal(expected.idempotencyKey, 'form:journey-smoke-abc12345');
  assert.match(expected.leadRecordId, /^lead_/);
  assert.match(expected.contactId, /^contact_/);
  assert.match(expected.followupWorkId, /^form_/);
  assert.match(expected.eventSortKey, /^client_event_/);
  assert.equal(expected.normalizedEmail, 'journey-smoke+abc12345@example.com');
  assert.match(expected.normalizedPhone, /^\+1\d{10}$/);
});

test('evaluateFunctionCandidate matches normalized Lambda names', () => {
  const match = evaluateFunctionCandidate(
    {
      FunctionName: 'amplify-d3du4u03f75wsu-main-branch-quoterequestsubmitlambda-XYZ',
    },
    'quote-request-submit',
  );

  const miss = evaluateFunctionCandidate(
    {
      FunctionName: 'amplify-d3du4u03f75wsu-main-branch-emailintakecapturelambda-XYZ',
    },
    'quote-request-submit',
  );

  assert.equal(match, 'amplify-d3du4u03f75wsu-main-branch-quoterequestsubmitlambda-XYZ');
  assert.equal(miss, null);
});
