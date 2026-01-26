import { defineBackend } from '@aws-amplify/backend';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { FunctionUrl, FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda';

import { chatkitSession } from './functions/chatkit-session/resource';
import { chatkitLeadEmail } from './functions/chatkit-lead-email/resource';

const backend = defineBackend({
  chatkitSession,
  chatkitLeadEmail,
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

backend.addOutput({
  custom: {
    // Used by the frontend widget (via /amplify_outputs.json) to locate the session endpoint.
    chatkit_session_url: chatkitSessionUrl.url,
    // Used by the frontend widget to send transcripts to the shop.
    chatkit_lead_email_url: chatkitLeadEmailUrl.url,
  },
});
