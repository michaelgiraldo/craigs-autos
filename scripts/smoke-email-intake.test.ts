import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInboundEmail } from '../amplify/functions/email-intake-capture/mime.ts';
import {
  buildSyntheticRawEmail,
  evaluateFunctionCandidate,
  lambdaArnMatches,
  parseArgs,
  prepareSyntheticScenario,
} from './smoke-email-intake.ts';

test('parseArgs reads the supported smoke email intake flags', () => {
  const options = parseArgs([
    '--apply',
    '--keep-records',
    '--profile',
    'AdministratorAccess-281934899223',
    '--region',
    'us-west-2',
    '--function-name',
    'email-intake-capture-live',
    '--function-name-contains',
    'custom-pattern',
    '--bucket',
    'synthetic-bucket',
    '--json',
  ]);

  assert.equal(options.apply, true);
  assert.equal(options.keepRecords, true);
  assert.equal(options.profile, 'AdministratorAccess-281934899223');
  assert.equal(options.region, 'us-west-2');
  assert.equal(options.functionName, 'email-intake-capture-live');
  assert.equal(options.functionNameContains, 'custom-pattern');
  assert.equal(options.bucketName, 'synthetic-bucket');
  assert.equal(options.json, true);
});

test('buildSyntheticRawEmail produces a parseable Google-routed email', async () => {
  const raw = buildSyntheticRawEmail({
    config: {
      googleRouteHeaderValue: 'contact-public-intake',
      intakeRecipient: 'contact-intake@email-intake.craigs.autos',
      model: 'gpt-test',
      originalRecipient: 'contact@craigs.autos',
      shopAddress: '271 Bestor St, San Jose, CA 95112',
      shopName: "Craig's Auto Upholstery",
      shopPhoneDisplay: '(408) 379-3820',
      siteLabel: 'craigs.autos',
    },
    customerEmail: 'smoke@example.com',
    customerName: 'Synthetic Email Intake Smoke',
    messageId: '<smoke@example.com>',
    runId: 'abc12345',
  });

  const email = await parseInboundEmail(raw);

  assert.equal(email.from?.address, 'smoke@example.com');
  assert.equal(email.subject, 'Synthetic email intake smoke abc12345');
  assert.equal(email.header('x-craigs-google-route'), 'contact-public-intake');
  assert.equal(email.header('x-gm-original-to'), 'contact@craigs.autos');
});

test('prepareSyntheticScenario derives deterministic ids for one run id', async () => {
  const scenario = await prepareSyntheticScenario({
    bucketName: 'synthetic-bucket',
    config: {
      googleRouteHeaderValue: 'contact-public-intake',
      intakeRecipient: 'contact-intake@email-intake.craigs.autos',
      model: 'gpt-test',
      originalRecipient: 'contact@craigs.autos',
      shopAddress: '271 Bestor St, San Jose, CA 95112',
      shopName: "Craig's Auto Upholstery",
      shopPhoneDisplay: '(408) 379-3820',
      siteLabel: 'craigs.autos',
    },
    runId: 'abc12345',
  });

  assert.equal(scenario.source.key, 'synthetic-email-intake/abc12345.eml');
  assert.equal(scenario.followupWorkId.startsWith('email_'), true);
  assert.equal(scenario.idempotencyKey.startsWith('email:'), true);
  assert.equal(scenario.messageLedgerKey.startsWith('message:'), true);
  assert.equal(scenario.threadLedgerKey, `thread:${scenario.threadKey}`);
});

test('lambda discovery helpers match normalized names and ARNs', () => {
  const match = evaluateFunctionCandidate(
    {
      FunctionName: 'amplify-main-emailintakecapturelambda-XYZ',
    },
    'email-intake-capture',
  );
  const exactArn = lambdaArnMatches({
    candidateArn:
      'arn:aws:lambda:us-west-1:123456789012:function:amplify-main-emailintakecapturelambda-XYZ',
    functionArn:
      'arn:aws:lambda:us-west-1:123456789012:function:amplify-main-emailintakecapturelambda-XYZ',
    functionName: 'amplify-main-emailintakecapturelambda-XYZ',
  });
  const namedArn = lambdaArnMatches({
    candidateArn:
      'arn:aws:lambda:us-west-1:123456789012:function:amplify-main-emailintakecapturelambda-XYZ',
    functionArn: 'arn:aws:lambda:us-west-1:123456789012:function:different-version',
    functionName: 'amplify-main-emailintakecapturelambda-XYZ',
  });

  assert.equal(match, 'amplify-main-emailintakecapturelambda-XYZ');
  assert.equal(exactArn, true);
  assert.equal(namedArn, true);
});
