import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { z } from 'zod';
import { LEAD_PHOTO_LIMITS } from '../_lead-platform/domain/lead-attachment.ts';
import type { LeadAttachmentUploadStartDeps } from './handler.ts';

const UPLOAD_TARGET_EXPIRES_SECONDS = 10 * 60;

const envSchema = z.object({
  LEAD_ATTACHMENT_BUCKET_NAME: z.string().trim().min(1),
});

export function createLeadAttachmentUploadStartRuntime(
  env: NodeJS.ProcessEnv = process.env,
): LeadAttachmentUploadStartDeps {
  const parsedEnv = envSchema.safeParse(env);
  const s3 = parsedEnv.success ? new S3Client({}) : null;

  return {
    configValid: parsedEnv.success && Boolean(s3),
    createUploadTarget: async ({ attachmentId, byteSize, clientEventId, contentType, key }) => {
      if (!s3 || !parsedEnv.success) {
        throw new Error('Lead attachment S3 bucket is not configured');
      }

      const result = await createPresignedPost(s3, {
        Bucket: parsedEnv.data.LEAD_ATTACHMENT_BUCKET_NAME,
        Key: key,
        Conditions: [
          ['content-length-range', 1, Math.min(byteSize, LEAD_PHOTO_LIMITS.maxBytesPerPhoto)],
          ['eq', '$Content-Type', contentType],
          ['eq', '$key', key],
          ['eq', '$x-amz-meta-client-event-id', clientEventId],
          ['eq', '$x-amz-meta-attachment-id', attachmentId],
        ],
        Fields: {
          'Content-Type': contentType,
          'x-amz-meta-client-event-id': clientEventId,
          'x-amz-meta-attachment-id': attachmentId,
        },
        Expires: UPLOAD_TARGET_EXPIRES_SECONDS,
      });

      return {
        fields: result.fields,
        url: result.url,
      };
    },
  };
}
