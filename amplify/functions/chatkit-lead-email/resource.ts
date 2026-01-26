import { defineFunction, secret } from '@aws-amplify/backend';

export const chatkitLeadEmail = defineFunction({
  name: 'chatkit-lead-email',
  runtime: 20,
  timeoutSeconds: 30,
  environment: {
    OPENAI_API_KEY: secret('OPENAI_API_KEY'),
    // Defaults can be overridden later if you want to route leads differently.
    LEAD_TO_EMAIL: 'victor@craigs.autos',
    LEAD_FROM_EMAIL: 'victor@craigs.autos',
    // Used to generate a concise internal summary + next steps for the shop.
    LEAD_SUMMARY_MODEL: 'gpt-4.1-mini',
  },
});
