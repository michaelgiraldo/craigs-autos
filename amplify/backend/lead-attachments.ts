import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  HttpMethods,
} from 'aws-cdk-lib/aws-s3';
import type { CraigsBackend } from './types';
import { getLambda } from './types';
import { PUBLIC_ALLOWED_ORIGINS } from './cors';

const FORM_ATTACHMENT_PREFIX = 'form/';

export function configureLeadAttachments(backend: CraigsBackend): void {
  const uploadStartLambda = getLambda(backend.leadAttachmentUploadStart);
  const quoteRequestSubmitLambda = getLambda(backend.quoteRequestSubmit);
  const leadFollowupWorkerLambda = getLambda(backend.leadFollowupWorker);
  const stack = Stack.of(uploadStartLambda);

  const bucket = new Bucket(stack, 'LeadTransientAttachments', {
    autoDeleteObjects: true,
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    cors: [
      {
        allowedHeaders: ['*'],
        allowedMethods: [HttpMethods.POST],
        allowedOrigins: PUBLIC_ALLOWED_ORIGINS,
      },
    ],
    encryption: BucketEncryption.S3_MANAGED,
    enforceSSL: true,
    lifecycleRules: [
      {
        abortIncompleteMultipartUploadAfter: Duration.days(1),
        expiration: Duration.days(1),
        prefix: FORM_ATTACHMENT_PREFIX,
      },
    ],
    removalPolicy: RemovalPolicy.DESTROY,
  });

  bucket.grantPut(uploadStartLambda);
  bucket.grantRead(quoteRequestSubmitLambda);
  bucket.grantRead(leadFollowupWorkerLambda);
  bucket.grantDelete(leadFollowupWorkerLambda);

  uploadStartLambda.addEnvironment('LEAD_ATTACHMENT_BUCKET_NAME', bucket.bucketName);
  quoteRequestSubmitLambda.addEnvironment('LEAD_ATTACHMENT_BUCKET_NAME', bucket.bucketName);
  leadFollowupWorkerLambda.addEnvironment('LEAD_ATTACHMENT_BUCKET_NAME', bucket.bucketName);
}
