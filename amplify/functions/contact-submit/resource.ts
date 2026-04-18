import { defineFunction } from '@aws-amplify/backend';
import { CRAIGS_LEAD_ENV_DEFAULTS } from '../../../shared/business-profile.js';

export const contactSubmit = defineFunction({
  name: 'contact-submit',
  runtime: 24,
  timeoutSeconds: 20,
  environment: {
    CONTACT_SITE_LABEL: CRAIGS_LEAD_ENV_DEFAULTS.CONTACT_SITE_LABEL,
  },
});
