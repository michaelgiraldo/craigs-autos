import assert from 'node:assert/strict';
import test from 'node:test';
import type OpenAI from 'openai';
import { LEAD_AI_TASK_POLICY } from '@craigs/contracts/lead-ai-policy';
import { createOpenAiEmailLeadEvaluator } from './classification.ts';
import type { ParsedInboundEmail } from './types.ts';

function emailFixture(): ParsedInboundEmail {
  return {
    attachmentCount: 0,
    cc: [],
    date: '',
    from: { address: 'customer@example.com', name: 'Customer Example' },
    header: () => '',
    inReplyTo: '',
    messageId: '<message-1@example.com>',
    photoAttachments: [],
    references: '',
    subject: 'Seat repair',
    text: 'Can you fix the driver seat in my Toyota Camry?',
    to: [{ address: 'contact@craigs.autos', name: '' }],
    unsupportedAttachmentCount: 0,
  };
}

test('email lead evaluator uses the email triage AI task policy', async () => {
  const requests: unknown[] = [];
  const openai = {
    responses: {
      parse: async (request: unknown) => {
        requests.push(request);
        return {
          output_parsed: {
            triage_decision: 'review',
            triage_reason: 'needs human review before response',
            customer_name: 'Customer Example',
            customer_email: 'customer@example.com',
            customer_phone: null,
            customer_language: 'English',
            vehicle: 'Toyota Camry',
            service: 'seat repair',
            project_summary: 'Customer asks about a driver seat repair.',
            known_facts: ['Toyota Camry', 'driver seat repair'],
            recommended_next_steps: ['Review the request and ask for photos.'],
            missing_info: ['photos'],
          },
        };
      },
    },
  } as unknown as OpenAI;
  const evaluate = createOpenAiEmailLeadEvaluator({
    config: {
      googleRouteHeaderValue: 'contact-public-intake',
      intakeRecipient: 'contact-intake@email-intake.craigs.autos',
      model: LEAD_AI_TASK_POLICY.emailIntakeTriage.model,
      originalRecipient: 'contact@craigs.autos',
      shopAddress: '271 Bestor St, San Jose, CA 95112',
      shopName: "Craig's Auto Upholstery",
      shopPhoneDisplay: '(408) 379-3820',
      siteLabel: 'craigs.autos',
    },
    openai,
  });

  const result = await evaluate({ email: emailFixture(), photos: [] });

  const request = requests[0] as { max_output_tokens?: number; reasoning?: unknown };
  assert.equal(result.triageDecision, 'review');
  assert.equal(result.customerResponsePolicy, 'manual_review');
  assert.deepEqual(request.reasoning, LEAD_AI_TASK_POLICY.emailIntakeTriage.reasoning);
  assert.equal(request.max_output_tokens, LEAD_AI_TASK_POLICY.emailIntakeTriage.maxOutputTokens);
});
