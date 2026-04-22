import { defineFunction, secret } from '@aws-amplify/backend';
import { CRAIGS_LEAD_ENV_DEFAULTS } from '@craigs/business-profile/business-profile';
import { LEAD_AI_TASK_POLICY } from '@craigs/contracts/lead-ai-policy';

export const chatHandoffPromote = defineFunction({
  name: 'chat-handoff-promote',
  runtime: 24,
  timeoutSeconds: 60,
  environment: {
    CHATKIT_OPENAI_API_KEY: secret('OPENAI_API_KEY'),
    LEAD_SUMMARY_MODEL: LEAD_AI_TASK_POLICY.chatTranscriptLeadSummary.model,
    SHOP_NAME: CRAIGS_LEAD_ENV_DEFAULTS.SHOP_NAME,
    SHOP_PHONE_DISPLAY: CRAIGS_LEAD_ENV_DEFAULTS.SHOP_PHONE_DISPLAY,
    SHOP_PHONE_DIGITS: CRAIGS_LEAD_ENV_DEFAULTS.SHOP_PHONE_DIGITS,
  },
});
