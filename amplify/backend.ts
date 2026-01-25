import { defineBackend } from '@aws-amplify/backend';
import { Duration, Stack } from 'aws-cdk-lib';
import { FunctionUrl, FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda';

import { chatkitSession } from './functions/chatkit-session/resource';

const backend = defineBackend({
  chatkitSession,
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

backend.addOutput({
  custom: {
    // Used by the frontend widget (via /amplify_outputs.json) to locate the session endpoint.
    chatkit_session_url: chatkitSessionUrl.url,
  },
});
