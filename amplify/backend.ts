import { defineBackend } from '@aws-amplify/backend';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { CfnFunction, FunctionUrl, FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda';

import { chatkitSession } from './functions/chatkit-session/resource';
import { chatkitLeadEmail } from './functions/chatkit-lead-email/resource';
import { chatkitMessageLink } from './functions/chatkit-message-link/resource';
import { chatkitLeadSignal } from './functions/chatkit-lead-signal/resource';
import { chatkitLeadAdmin } from './functions/chatkit-lead-admin/resource';

const backend = defineBackend({
  chatkitSession,
  chatkitLeadEmail,
  chatkitMessageLink,
  chatkitLeadSignal,
  chatkitLeadAdmin,
});

function setLambdaDescription(resource: unknown, description: string): void {
  const cfn = (resource as any)?.node?.defaultChild;
  if (cfn instanceof CfnFunction) {
    cfn.addPropertyOverride('Description', description);
    return;
  }
  // Fallback for interface-typed resources where the underlying child is still a CfnFunction.
  if (cfn && typeof cfn.addPropertyOverride === 'function') {
    cfn.addPropertyOverride('Description', description);
    return;
  }
  throw new Error('Unable to set Lambda description: missing CfnFunction default child');
}

setLambdaDescription(
  backend.chatkitSession.resources.lambda,
  'Creates ChatKit sessions and returns ephemeral client secrets with locale, page, user, and shop-time state.'
);
setLambdaDescription(
  backend.chatkitLeadEmail.resources.lambda,
  'Fetches ChatKit transcripts, generates internal lead summaries, enforces thread-level idempotency, and sends lead emails via SES.'
);
setLambdaDescription(
  backend.chatkitMessageLink.resources.lambda,
  'Resolves tokenized message-link payloads into recipient phone and message body for the /message handoff page.'
);
setLambdaDescription(
  backend.chatkitLeadSignal.resources.lambda,
  'Logs lead interaction attribution events (call, text, email, directions, landing) to DynamoDB.'
);
setLambdaDescription(
  backend.chatkitLeadAdmin.resources.lambda,
  'Password-protected admin API to list lead records and update qualification status for conversion workflows.'
);

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

// Expose a lightweight endpoint used by `/message` to resolve a token into
// {to_phone, body}. The browser then opens the selected channel client (SMS, Google Voice, etc).
const chatkitMessageLinkUrl = new FunctionUrl(
  Stack.of(backend.chatkitMessageLink.resources.lambda),
  'ChatkitMessageLinkUrl',
  {
    function: backend.chatkitMessageLink.resources.lambda,
    authType: FunctionUrlAuthType.NONE,
    cors: {
      allowedOrigins: [
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

backend.chatkitLeadEmail.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resources: ['*'],
  })
);

const chatkitLeadRetrySchedulerInvokeRole = new Role(
  Stack.of(backend.chatkitLeadEmail.resources.lambda),
  'ChatkitLeadRetrySchedulerInvokeRole',
  {
    assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
  }
);

chatkitLeadRetrySchedulerInvokeRole.addToPolicy(
  new PolicyStatement({
    actions: ['lambda:InvokeFunction'],
    resources: ['*'],
  })
);

backend.chatkitLeadEmail.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      'scheduler:CreateSchedule',
      'scheduler:UpdateSchedule',
      'scheduler:DeleteSchedule',
      'scheduler:GetSchedule',
    ],
    resources: ['*'],
  })
);

backend.chatkitLeadEmail.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['iam:PassRole'],
    resources: [chatkitLeadRetrySchedulerInvokeRole.roleArn],
  })
);

(backend.chatkitLeadEmail.resources.lambda as any).addEnvironment(
  'LEAD_RETRY_SCHEDULER_ROLE_ARN',
  chatkitLeadRetrySchedulerInvokeRole.roleArn
);
(backend.chatkitLeadEmail.resources.lambda as any).addEnvironment(
  'LEAD_RETRY_SCHEDULE_GROUP',
  'default'
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

// Used by tokenized message handoff links in lead emails.
const chatkitMessageLinkTokenTable = new Table(
  Stack.of(backend.chatkitMessageLink.resources.lambda),
  'ChatkitMessageLinkTokenTable',
  {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'token', type: AttributeType.STRING },
    timeToLiveAttribute: 'ttl',
    removalPolicy: RemovalPolicy.RETAIN,
  }
);

chatkitMessageLinkTokenTable.grantReadData(backend.chatkitMessageLink.resources.lambda);
chatkitMessageLinkTokenTable.grantReadWriteData(backend.chatkitLeadEmail.resources.lambda);

(backend.chatkitMessageLink.resources.lambda as any).addEnvironment(
  'MESSAGE_LINK_TOKEN_TABLE_NAME',
  chatkitMessageLinkTokenTable.tableName
);
(backend.chatkitLeadEmail.resources.lambda as any).addEnvironment(
  'MESSAGE_LINK_TOKEN_TABLE_NAME',
  chatkitMessageLinkTokenTable.tableName
);

backend.addOutput({
  custom: {
    // Used by the frontend widget (via /amplify_outputs.json) to locate the session endpoint.
    chatkit_session_url: chatkitSessionUrl.url,
    // Used by the frontend widget to send transcripts to the shop.
    chatkit_lead_email_url: chatkitLeadEmailUrl.url,
    // Used by /message/?token=... to resolve tokens into message drafts.
    chatkit_message_link_url: chatkitMessageLinkUrl.url,
    // Used by the frontend to log lead signals (tel/sms/directions clicks).
    chatkit_lead_signal_url: chatkitLeadSignalUrl.url,
    // Used by the admin UI to fetch and qualify leads.
    chatkit_lead_admin_url: chatkitLeadAdminUrl.url,
  },
});
