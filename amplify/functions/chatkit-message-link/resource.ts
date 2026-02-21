import { defineFunction } from '@aws-amplify/backend';

export const chatkitMessageLink = defineFunction({
  name: 'chatkit-message-link',
  runtime: 24,
  timeoutSeconds: 10,
});
