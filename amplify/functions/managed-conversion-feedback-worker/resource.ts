import { defineFunction } from '@aws-amplify/backend';

export const managedConversionFeedbackWorker = defineFunction({
  name: 'managed-conversion-feedback-worker',
  runtime: 24,
  timeoutSeconds: 30,
  schedule: 'every 5m',
  environment: {
    MANAGED_CONVERSION_FEEDBACK_BATCH_SIZE: '10',
    MANAGED_CONVERSION_FEEDBACK_LEASE_SECONDS: '300',
    MANAGED_CONVERSION_FEEDBACK_MAX_ATTEMPTS: '3',
    GOOGLE_ADS_CONVERSION_FEEDBACK_MODE: 'dry_run',
    GOOGLE_ADS_CUSTOMER_ID: '',
    GOOGLE_ADS_CONVERSION_ACTION_RESOURCE_NAME: '',
    GOOGLE_ADS_CONVERSION_ACTION_ID: '',
    GOOGLE_ADS_DEFAULT_CONVERSION_VALUE: '',
    GOOGLE_ADS_CURRENCY_CODE: 'USD',
    GOOGLE_ADS_AD_USER_DATA_CONSENT: '',
    GOOGLE_ADS_ACCOUNT_DEFAULT_CONSENT_CONFIGURED: 'false',
  },
});
