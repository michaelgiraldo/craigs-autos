import { defineFunction, secret } from '@aws-amplify/backend';

export const chatkitAttachmentUpload = defineFunction({
  name: 'chatkit-attachment-upload',
  runtime: 20,
  timeoutSeconds: 20,
  environment: {
    CHATKIT_ATTACHMENT_ALLOWED_MIME_TYPES:
      'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif',
  },
});

