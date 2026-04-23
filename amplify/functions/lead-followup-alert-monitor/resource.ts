import { defineFunction } from '@aws-amplify/backend';
import { CRAIGS_LEAD_ENV_DEFAULTS } from '@craigs/business-profile/business-profile';

export const leadFollowupAlertMonitor = defineFunction({
  name: 'lead-followup-alert-monitor',
  runtime: 24,
  timeoutSeconds: 30,
  schedule: 'every 5m',
  environment: {
    LEAD_FAILURE_ALERT_FROM_EMAIL: CRAIGS_LEAD_ENV_DEFAULTS.LEAD_FAILURE_ALERT_FROM_EMAIL,
    LEAD_FAILURE_ALERT_EMAILS: CRAIGS_LEAD_ENV_DEFAULTS.LEAD_FAILURE_ALERT_EMAILS,
    LEAD_FAILURE_ALERT_BATCH_SIZE: CRAIGS_LEAD_ENV_DEFAULTS.LEAD_FAILURE_ALERT_BATCH_SIZE,
    LEAD_FAILURE_ALERT_MIN_INTERVAL_SECONDS:
      CRAIGS_LEAD_ENV_DEFAULTS.LEAD_FAILURE_ALERT_MIN_INTERVAL_SECONDS,
  },
});
