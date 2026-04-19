import { defineFunction, secret } from '@aws-amplify/backend';

export const leadAdminApi = defineFunction({
  name: 'lead-admin-api',
  runtime: 24,
  timeoutSeconds: 15,
  environment: {
    LEADS_ADMIN_PASSWORD: secret('LEADS_ADMIN_PASSWORD'),
    MANAGED_CONVERSION_DESTINATIONS: process.env.MANAGED_CONVERSION_DESTINATIONS ?? '',
  },
});
