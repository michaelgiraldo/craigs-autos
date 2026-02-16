import { defineBackend } from '@aws-amplify/backend';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { FunctionUrl, FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda';

import { chatkitSession } from './functions/chatkit-session/resource';
import { chatkitAttachmentUpload } from './functions/chatkit-attachment-upload/resource';
import { chatkitLeadEmail } from './functions/chatkit-lead-email/resource';
import { chatkitSmsLink } from './functions/chatkit-sms-link/resource';
import { chatkitLeadSignal } from './functions/chatkit-lead-signal/resource';
import { chatkitLeadAdmin } from './functions/chatkit-lead-admin/resource';

const backend = defineBackend({
  chatkitSession,
  chatkitAttachmentUpload,
  chatkitLeadEmail,
  chatkitSmsLink,
  chatkitLeadSignal,
  chatkitLeadAdmin,
});

// Expose a lightweight HTTPS endpoint that creates ChatKit sessions.
// This keeps OpenAI credentials on the server while ChatKit renders the UI client-side.
const chatkitSessionUrl = new FunctionUrl(
  Stack.of(backend.chatkitSession.resources.lambda),
  'ChatkitSessionUrl',
  {
    function: backend.chatkitSession.resources.lambda,
    authType: FunctionUrlAuthType.NONE,
    cors: {
      allowedOrigins: [
        'https://chat.craigs.autos',
        'https://craigs.autos',
        'http://localhost:4321',
      ],
      // Function URL CORS allowMethods does not accept OPTIONS (preflight is handled automatically).
      allowedMethods: [HttpMethod.POST],
      allowedHeaders: ['content-type'],
      // Lambda Function URL CORS maxAge is capped at 86400 seconds.
      maxAge: Duration.days(1),
    },
  }
);

const chatkitAttachmentUploadUrl = new FunctionUrl(
  Stack.of(backend.chatkitAttachmentUpload.resources.lambda),
  'ChatkitAttachmentUploadUrl',
  {
    function: backend.chatkitAttachmentUpload.resources.lambda,
    authType: FunctionUrlAuthType.NONE,
    cors: {
      allowedOrigins: [
        'https://chat.craigs.autos',
        'https://craigs.autos',
        'http://localhost:4321',
      ],
      // Function URL CORS allowMethods does not accept OPTIONS (preflight is handled automatically).
      allowedMethods: [HttpMethod.POST, HttpMethod.GET],
      allowedHeaders: ['content-type'],
      // Lambda Function URL CORS maxAge is capped at 86400 seconds.
      maxAge: Duration.days(1),
    },
  }
);

// Expose an endpoint to email a transcript of a thread to the shop.
const chatkitLeadEmailUrl = new FunctionUrl(
  Stack.of(backend.chatkitLeadEmail.resources.lambda),
  'ChatkitLeadEmailUrl',
  {
    function: backend.chatkitLeadEmail.resources.lambda,
    authType: FunctionUrlAuthType.NONE,
    cors: {
      allowedOrigins: [
        'https://chat.craigs.autos',
        'https://craigs.autos',
        'http://localhost:4321',
      ],
      allowedMethods: [HttpMethod.POST],
      allowedHeaders: ['content-type'],
      maxAge: Duration.days(1),
    },
  }
);

// Expose a lightweight endpoint used by `sms.craigs.autos` to resolve a token into
// {to_phone, body}. The browser then opens `sms:` locally (Apple Messages, etc).
const chatkitSmsLinkUrl = new FunctionUrl(
  Stack.of(backend.chatkitSmsLink.resources.lambda),
  'ChatkitSmsLinkUrl',
  {
    function: backend.chatkitSmsLink.resources.lambda,
    authType: FunctionUrlAuthType.NONE,
    cors: {
      allowedOrigins: [
        'https://sms.craigs.autos',
        'https://chat.craigs.autos',
        'https://craigs.autos',
        'http://localhost:4321',
      ],
      allowedMethods: [HttpMethod.GET],
      allowedHeaders: ['content-type'],
      maxAge: Duration.days(1),
    },
  }
);

// Expose a lightweight endpoint to log lead signals (tel/sms/directions clicks).
const chatkitLeadSignalUrl = new FunctionUrl(
  Stack.of(backend.chatkitLeadSignal.resources.lambda),
  'ChatkitLeadSignalUrl',
  {
    function: backend.chatkitLeadSignal.resources.lambda,
    authType: FunctionUrlAuthType.NONE,
    cors: {
      allowedOrigins: [
        'https://chat.craigs.autos',
        'https://craigs.autos',
        'http://localhost:4321',
      ],
      allowedMethods: [HttpMethod.POST],
      allowedHeaders: ['content-type'],
      maxAge: Duration.days(1),
    },
  }
);

// Expose a lightweight admin endpoint for lead qualification (password protected in Lambda).
const chatkitLeadAdminUrl = new FunctionUrl(
  Stack.of(backend.chatkitLeadAdmin.resources.lambda),
  'ChatkitLeadAdminUrl',
  {
    function: backend.chatkitLeadAdmin.resources.lambda,
    authType: FunctionUrlAuthType.NONE,
    cors: {
      allowedOrigins: [
        'https://craigs.autos',
        'http://localhost:4321',
      ],
      allowedMethods: [HttpMethod.GET, HttpMethod.POST],
      allowedHeaders: ['content-type', 'authorization'],
      maxAge: Duration.days(1),
    },
  }
);

const chatkitAttachmentBucket = new Bucket(
  Stack.of(backend.chatkitAttachmentUpload.resources.lambda),
  'ChatkitAttachmentBucket',
  {
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    enforceSSL: true,
    removalPolicy: RemovalPolicy.RETAIN,
    lifecycleRules: [
      {
        // Keep only what's needed for human follow-up quality; adjust if long-term retention needed.
        expiration: Duration.days(365),
      },
    ],
  }
);

chatkitAttachmentBucket.grantPut(backend.chatkitAttachmentUpload.resources.lambda);
chatkitAttachmentBucket.grantRead(backend.chatkitAttachmentUpload.resources.lambda);
(backend.chatkitAttachmentUpload.resources.lambda as any).addEnvironment(
  'CHATKIT_ATTACHMENT_BUCKET_NAME',
  chatkitAttachmentBucket.bucketName
);
(backend.chatkitAttachmentUpload.resources.lambda as any).addEnvironment(
  'CHATKIT_ATTACHMENT_PREVIEW_BASE_URL',
  chatkitAttachmentUploadUrl.url
);
(backend.chatkitAttachmentUpload.resources.lambda as any).addEnvironment(
  'CHATKIT_ATTACHMENT_MAX_BYTES',
  '8000000'
);

backend.chatkitLeadEmail.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resources: ['*'],
  })
);

// Production-grade idempotency: ensure we only email one lead per ChatKit thread (`cthr_...`),
// even if multiple browsers/devices trigger the send endpoint.
const chatkitLeadDedupeTable = new Table(
  Stack.of(backend.chatkitLeadEmail.resources.lambda),
  'ChatkitLeadDedupeTable',
  {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'thread_id', type: AttributeType.STRING },
    timeToLiveAttribute: 'ttl',
    // Safe default for production; note that deleting the Amplify environment will retain this table.
    removalPolicy: RemovalPolicy.RETAIN,
  }
);

chatkitLeadDedupeTable.grantReadWriteData(backend.chatkitLeadEmail.resources.lambda);
// Amplify types `resources.lambda` as IFunction (missing addEnvironment), but the concrete
// Lambda construct supports it.
(backend.chatkitLeadEmail.resources.lambda as any).addEnvironment(
  'LEAD_DEDUPE_TABLE_NAME',
  chatkitLeadDedupeTable.tableName
);

// Store attribution data (GCLID/UTM) for offline conversion uploads.
const chatkitLeadAttributionTable = new Table(
  Stack.of(backend.chatkitLeadEmail.resources.lambda),
  'ChatkitLeadAttributionTable',
  {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'lead_id', type: AttributeType.STRING },
    timeToLiveAttribute: 'ttl',
    removalPolicy: RemovalPolicy.RETAIN,
  }
);

chatkitLeadAttributionTable.grantReadWriteData(backend.chatkitLeadEmail.resources.lambda);
(backend.chatkitLeadEmail.resources.lambda as any).addEnvironment(
  'LEAD_ATTRIBUTION_TABLE_NAME',
  chatkitLeadAttributionTable.tableName
);

chatkitLeadAttributionTable.grantReadWriteData(backend.chatkitLeadSignal.resources.lambda);
(backend.chatkitLeadSignal.resources.lambda as any).addEnvironment(
  'LEAD_ATTRIBUTION_TABLE_NAME',
  chatkitLeadAttributionTable.tableName
);

chatkitLeadAttributionTable.grantReadWriteData(backend.chatkitLeadAdmin.resources.lambda);
(backend.chatkitLeadAdmin.resources.lambda as any).addEnvironment(
  'LEAD_ATTRIBUTION_TABLE_NAME',
  chatkitLeadAttributionTable.tableName
);

// Used by "Text customer / Text draft" links in lead emails.
const chatkitSmsLinkTokenTable = new Table(
  Stack.of(backend.chatkitSmsLink.resources.lambda),
  'ChatkitSmsLinkTokenTable',
  {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'token', type: AttributeType.STRING },
    timeToLiveAttribute: 'ttl',
    removalPolicy: RemovalPolicy.RETAIN,
  }
);

chatkitSmsLinkTokenTable.grantReadData(backend.chatkitSmsLink.resources.lambda);
chatkitSmsLinkTokenTable.grantReadWriteData(backend.chatkitLeadEmail.resources.lambda);

(backend.chatkitSmsLink.resources.lambda as any).addEnvironment(
  'SMS_LINK_TOKEN_TABLE_NAME',
  chatkitSmsLinkTokenTable.tableName
);
(backend.chatkitLeadEmail.resources.lambda as any).addEnvironment(
  'SMS_LINK_TOKEN_TABLE_NAME',
  chatkitSmsLinkTokenTable.tableName
);
(backend.chatkitLeadEmail.resources.lambda as any).addEnvironment(
  'CHATKIT_ATTACHMENT_PREVIEW_BASE_URL',
  chatkitAttachmentUploadUrl.url
);

backend.addOutput({
  custom: {
    // Used by the frontend widget (via /amplify_outputs.json) to locate the session endpoint.
    chatkit_session_url: chatkitSessionUrl.url,
    // Used by the frontend widget to send transcripts to the shop.
    chatkit_lead_email_url: chatkitLeadEmailUrl.url,
    // Used by the frontend widget to upload chat attachments.
    chatkit_attachment_upload_url: chatkitAttachmentUploadUrl.url,
    // Used by sms.craigs.autos/t/<token> to resolve tokens.
    chatkit_sms_link_url: chatkitSmsLinkUrl.url,
    // Used by the frontend to log lead signals (tel/sms/directions clicks).
    chatkit_lead_signal_url: chatkitLeadSignalUrl.url,
    // Used by the admin UI to fetch and qualify leads.
    chatkit_lead_admin_url: chatkitLeadAdminUrl.url,
  },
});
