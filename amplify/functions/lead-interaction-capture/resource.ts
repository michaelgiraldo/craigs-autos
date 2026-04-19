import { defineFunction } from '@aws-amplify/backend';

export const leadInteractionCapture = defineFunction({
  name: 'lead-interaction-capture',
  runtime: 24,
  timeoutSeconds: 15,
});
