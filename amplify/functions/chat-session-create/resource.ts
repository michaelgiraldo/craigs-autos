import { defineFunction, secret } from '@aws-amplify/backend';

export const chatSessionCreate = defineFunction({
  name: 'chat-session-create',
  runtime: 24,
  timeoutSeconds: 20,
  environment: {
    OPENAI_API_KEY: secret('OPENAI_API_KEY'),
    CHATKIT_WORKFLOW_ID: secret('CHATKIT_WORKFLOW_ID'),
  },
});
