import assert from 'node:assert/strict';
import test from 'node:test';
import type OpenAI from 'openai';
import { LEAD_AI_TASK_POLICY } from '@craigs/contracts/lead-ai-policy';
import { generateLeadSummary } from './lead-summary.ts';

test('generateLeadSummary uses the lead-summary AI task policy', async () => {
  const requests: unknown[] = [];
  const openai = {
    responses: {
      parse: async (request: unknown) => {
        requests.push(request);
        return {
          output_parsed: {
            customer_name: 'Chris',
            customer_phone: '(408) 555-0101',
            customer_email: null,
            customer_location: null,
            customer_language: 'English',
            vehicle: '2010 VW Eos',
            service: 'seat upholstery repair',
            project_summary: 'Driver seat tear and loose passenger door upholstery.',
            customer_message: 'Customer needs upholstery repair help.',
            automation_ready: true,
            automation_reason: 'ready_for_follow_up',
            known_facts: ['2010 VW Eos', 'driver seat tear'],
            recommended_next_steps: ['Ask for photos of the seat and door panel.'],
            already_asked_questions: [],
            missing_info: ['photos'],
          },
        };
      },
    },
  } as unknown as OpenAI;

  const summary = await generateLeadSummary({
    openai,
    leadSummaryModel: LEAD_AI_TASK_POLICY.chatTranscriptLeadSummary.model,
    locale: 'en',
    pageUrl: 'https://craigs.autos/en/request-a-quote/',
    transcript: [
      {
        created_at: 1_000,
        speaker: 'Customer',
        text: 'I have a 2010 VW Eos with a torn driver seat.',
      },
    ],
    shopName: "Craig's Auto Upholstery",
    shopPhoneDisplay: '(408) 379-3820',
  });

  const request = requests[0] as { max_output_tokens?: number; reasoning?: unknown };
  assert.equal(summary?.customer_response_policy, 'automatic');
  assert.equal(summary?.project_summary, 'Driver seat tear and loose passenger door upholstery.');
  assert.deepEqual(request.reasoning, LEAD_AI_TASK_POLICY.chatTranscriptLeadSummary.reasoning);
  assert.equal(
    request.max_output_tokens,
    LEAD_AI_TASK_POLICY.chatTranscriptLeadSummary.maxOutputTokens,
  );
});
