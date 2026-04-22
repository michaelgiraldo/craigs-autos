import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { LEAD_AI_MODELS, LEAD_AI_TASK_POLICY } from '@craigs/contracts/lead-ai-policy';

test('lead AI model policy pins quality-first GPT-5.4 models', () => {
  assert.equal(LEAD_AI_MODELS.emailIntakeClassification, 'gpt-5.4-2026-03-05');
  assert.equal(LEAD_AI_MODELS.chatLeadSummary, 'gpt-5.4-2026-03-05');
  assert.equal(LEAD_AI_MODELS.customerFollowupDraft, 'gpt-5.4-2026-03-05');
  assert.deepEqual(LEAD_AI_TASK_POLICY.emailIntakeTriage.reasoning, { effort: 'medium' });
  assert.equal(LEAD_AI_TASK_POLICY.emailIntakeTriage.maxOutputTokens, 1000);
  assert.deepEqual(LEAD_AI_TASK_POLICY.chatTranscriptLeadSummary.reasoning, {
    effort: 'medium',
  });
  assert.equal(LEAD_AI_TASK_POLICY.chatTranscriptLeadSummary.maxOutputTokens, 1500);
  assert.deepEqual(LEAD_AI_TASK_POLICY.customerFollowupDraft.reasoning, { effort: 'high' });
  assert.equal(LEAD_AI_TASK_POLICY.customerFollowupDraft.maxOutputTokens, 2000);
});

test('lambda resources import the shared lead AI policy instead of hardcoding model ids', async () => {
  const resourceFiles = [
    new URL('../email-intake-capture/resource.ts', import.meta.url),
    new URL('../chat-handoff-promote/resource.ts', import.meta.url),
    new URL('../lead-followup-worker/resource.ts', import.meta.url),
  ];

  for (const resourceFile of resourceFiles) {
    const source = await readFile(resourceFile, 'utf8');
    assert.match(source, /@craigs\/contracts\/lead-ai-policy/);
    assert.doesNotMatch(source, /gpt-5\.2/);
  }
});
