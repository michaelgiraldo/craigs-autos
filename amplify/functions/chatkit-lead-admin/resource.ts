import { defineFunction, secret } from '@aws-amplify/backend';

export const chatkitLeadAdmin = defineFunction({
  name: 'chatkit-lead-admin',
  runtime: 24,
  timeoutSeconds: 15,
  environment: {
    LEADS_ADMIN_PASSWORD: secret('LEADS_ADMIN_PASSWORD'),
  },
});
