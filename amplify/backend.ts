import { defineBackend } from '@aws-amplify/backend';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { FunctionUrl, FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda';

import { chatkitSession } from './functions/chatkit-session/resource';
import { chatkitLeadEmail } from './functions/chatkit-lead-email/resource';
import { chatkitSmsLink } from './functions/chatkit-sms-link/resource';
import { chatkitLeadSignal } from './functions/chatkit-lead-signal/resource';

const backend = defineBackend({
  chatkitSession,
  chatkitLeadEmail,
  chatkitSmsLink,
  chatkitLeadSignal,
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

backend.addOutput({
  custom: {
    // Used by the frontend widget (via /amplify_outputs.json) to locate the session endpoint.
    chatkit_session_url: chatkitSessionUrl.url,
    // Used by the frontend widget to send transcripts to the shop.
    chatkit_lead_email_url: chatkitLeadEmailUrl.url,
    // Used by sms.craigs.autos/t/<token> to resolve tokens.
    chatkit_sms_link_url: chatkitSmsLinkUrl.url,
    // Used by the frontend to log lead signals (tel/sms/directions clicks).
    chatkit_lead_signal_url: chatkitLeadSignalUrl.url,
  },
});
