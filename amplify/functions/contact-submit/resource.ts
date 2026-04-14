import { defineFunction } from '@aws-amplify/backend';

export const contactSubmit = defineFunction({
  name: 'contact-submit',
  runtime: 24,
  timeoutSeconds: 20,
  environment: {
    CONTACT_SITE_LABEL: 'craigs.autos',
  },
});
