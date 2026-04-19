import { defineFunction } from '@aws-amplify/backend';

export const leadActionLinkResolve = defineFunction({
  name: 'lead-action-link-resolve',
  runtime: 24,
  timeoutSeconds: 10,
});
