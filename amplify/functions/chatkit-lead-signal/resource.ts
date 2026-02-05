import { defineFunction } from '@aws-amplify/backend';

export const chatkitLeadSignal = defineFunction({
  name: 'chatkit-lead-signal',
  runtime: 20,
  timeoutSeconds: 15,
});
