import { defineFunction } from '@aws-amplify/backend';
import { CRAIGS_LEAD_ENV_DEFAULTS } from '@craigs/business-profile/business-profile';

export const quoteRequestSubmit = defineFunction({
  name: 'quote-request-submit',
  runtime: 24,
  timeoutSeconds: 20,
  environment: {
    CONTACT_SITE_LABEL: CRAIGS_LEAD_ENV_DEFAULTS.CONTACT_SITE_LABEL,
  },
});
