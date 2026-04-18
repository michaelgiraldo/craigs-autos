import { defineFunction, secret } from '@aws-amplify/backend';

export const leadAdmin = defineFunction({
  name: 'lead-admin',
  runtime: 24,
  timeoutSeconds: 15,
  environment: {
    LEADS_ADMIN_PASSWORD: secret('LEADS_ADMIN_PASSWORD'),
  },
});
