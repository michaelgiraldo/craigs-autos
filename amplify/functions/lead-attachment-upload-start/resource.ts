import { defineFunction } from '@aws-amplify/backend';

export const leadAttachmentUploadStart = defineFunction({
  name: 'lead-attachment-upload-start',
  runtime: 24,
  timeoutSeconds: 20,
});
