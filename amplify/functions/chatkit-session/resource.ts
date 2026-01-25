import { defineFunction, secret } from '@aws-amplify/backend';

export const chatkitSession = defineFunction({
  name: 'chatkit-session',
  runtime: 20,
  timeoutSeconds: 20,
  environment: {
    OPENAI_API_KEY: secret('OPENAI_API_KEY'),
    CHATKIT_WORKFLOW_ID: secret('CHATKIT_WORKFLOW_ID'),
  },
});

