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
  },
});
