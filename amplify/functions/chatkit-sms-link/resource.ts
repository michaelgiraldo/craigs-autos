import { defineFunction } from '@aws-amplify/backend';

export const chatkitSmsLink = defineFunction({
  name: 'chatkit-sms-link',
  runtime: 20,
  timeoutSeconds: 10,
});

