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

  assert.doesNotMatch(handler, /runChatOutreach/);
  assert.doesNotMatch(handler, /sendTranscriptEmail/);
  assert.doesNotMatch(handler, /dedupe-store/);
  assert.doesNotMatch(handler, /SESv2Client/);
  assert.match(handler, /createLeadFollowupWorkItem/);
  assert.match(handler, /followupWork\.putIfAbsent/);
  assert.match(handler, /invokeLeadFollowupWorker/);

  for (const deletedPath of [
    'amplify/functions/chat-handoff-promote/dedupe-store.ts',
    'amplify/functions/chat-handoff-promote/outreach-workflow.ts',
    'amplify/backend/dynamo/chat-handoff-dedupe.ts',
  ]) {
    assert.equal(existsSync(path.join(repoRoot, deletedPath)), false);
  }
});

test('form and email intake enqueue shared follow-up work instead of quote queue records', () => {
  const formSubmit = readRepoFile('amplify/functions/quote-request-submit/submit-quote-request.ts');
  const emailIntake = readRepoFile(
    'amplify/functions/email-intake-capture/process-email-intake.ts',
  );
  const emailRuntime = readRepoFile('amplify/functions/email-intake-capture/runtime.ts');

  for (const source of [formSubmit, emailIntake, emailRuntime]) {
    assert.doesNotMatch(source, /createQuoteRequestRecord/);
    assert.doesNotMatch(source, /QuoteRequestRecord/);
    assert.doesNotMatch(source, /QUOTE_REQUESTS_TABLE_NAME/);
  }

  assert.match(formSubmit, /createLeadFollowupWorkItem/);
  assert.match(emailIntake, /createLeadFollowupWorkItem/);
  assert.match(emailRuntime, /followupWork\.putIfAbsent/);
});
