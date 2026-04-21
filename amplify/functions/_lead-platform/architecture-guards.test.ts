import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('chat handoff remains an intake adapter and does not send follow-up directly', () => {
  const handler = readRepoFile('amplify/functions/chat-handoff-promote/handler.ts');
  const captureService = readRepoFile(
    'amplify/functions/_lead-platform/services/capture-lead-source.ts',
  );

  assert.doesNotMatch(handler, /runChatOutreach/);
  assert.doesNotMatch(handler, /sendTranscriptEmail/);
  assert.doesNotMatch(handler, /dedupe-store/);
  assert.doesNotMatch(handler, /SESv2Client/);
  assert.match(handler, /createLeadFollowupWorkItem/);
  assert.match(handler, /captureLeadSource/);
  assert.match(handler, /invokeLeadFollowupWorker/);
  assert.doesNotMatch(handler, /completed:\s*(true|false)/);

  const captureFunction = captureService.slice(
    captureService.indexOf('export async function captureLeadSource'),
  );
  const reservationIndex = captureFunction.indexOf('followupWork.putIfAbsent');
  const leadPersistenceIndex = captureFunction.indexOf('persistAndDispatchLeadSource(args)');
  assert.ok(reservationIndex > -1);
  assert.ok(leadPersistenceIndex > -1);
  assert.ok(reservationIndex < leadPersistenceIndex);

  for (const deletedPath of [
    'amplify/functions/chat-handoff-promote/dedupe-store.ts',
    'amplify/functions/chat-handoff-promote/outreach-workflow.ts',
    'amplify/functions/chat-handoff-promote/attachments.ts',
    'amplify/functions/chat-handoff-promote/email-mime.ts',
    'amplify/backend/dynamo/chat-handoff-dedupe.ts',
  ]) {
    assert.equal(existsSync(path.join(repoRoot, deletedPath)), false);
  }
});

test('orphaned qualified export code stays out until an export workflow exists', () => {
  assert.equal(
    existsSync(
      path.join(repoRoot, 'amplify/functions/_lead-platform/services/export-qualified-cases.ts'),
    ),
    false,
  );
});

test('form and email intake enqueue shared follow-up work instead of quote queue records', () => {
  const formSubmit = readRepoFile('amplify/functions/quote-request-submit/submit-quote-request.ts');
  const chatHandoff = readRepoFile('amplify/functions/chat-handoff-promote/handler.ts');
  const emailIntake = readRepoFile(
    'amplify/functions/email-intake-capture/process-email-intake.ts',
  );
  const emailRuntime = readRepoFile('amplify/functions/email-intake-capture/runtime.ts');
  const captureService = readRepoFile(
    'amplify/functions/_lead-platform/services/capture-lead-source.ts',
  );

  for (const source of [formSubmit, emailIntake, emailRuntime]) {
    assert.doesNotMatch(source, /createQuoteRequestRecord/);
    assert.doesNotMatch(source, /QuoteRequestRecord/);
    assert.doesNotMatch(source, /QUOTE_REQUESTS_TABLE_NAME/);
  }

  assert.match(formSubmit, /createLeadFollowupWorkItem/);
  assert.match(formSubmit, /captureLeadSource/);
  assert.match(formSubmit, /createStableLeadFollowupWorkId\(\{\s*idempotencyKey,\s*prefix: 'form'/);
  assert.doesNotMatch(formSubmit, /form_\$\{clientEventId\}/);
  assert.match(emailIntake, /createLeadFollowupWorkItem/);
  assert.match(emailIntake, /captureLeadSource/);
  assert.match(
    emailIntake,
    /createStableLeadFollowupWorkId\(\{\s*idempotencyKey: threadKey,\s*prefix: 'email'/,
  );
  assert.match(
    chatHandoff,
    /createStableLeadFollowupWorkId\(\{\s*idempotencyKey,\s*prefix: 'chat'/,
  );
  assert.match(captureService, /followupWork\.putIfAbsent/);
  assert.doesNotMatch(emailRuntime, /enqueueFollowupWork/);
});

test('follow-up work uses idempotency key as the only durable lookup identity', () => {
  const repoContract = readRepoFile('amplify/functions/_lead-platform/repos/followup-work-repo.ts');
  const dynamoRepo = readRepoFile('amplify/functions/_lead-platform/repos/dynamo/followup-work.ts');
  const leadDataInfra = readRepoFile('amplify/backend/dynamo/lead-data.ts');

  assert.match(repoContract, /getByIdempotencyKey/);
  assert.doesNotMatch(repoContract, /getByFollowupWorkId/);
  assert.doesNotMatch(dynamoRepo, /followup_work_id-index/);
  assert.doesNotMatch(leadDataInfra, /followup_work_id-index/);
});
