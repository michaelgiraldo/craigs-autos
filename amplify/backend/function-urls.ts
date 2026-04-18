import { Duration, Stack } from 'aws-cdk-lib';
import { FunctionUrl, FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda';
import type { CraigsBackend, LambdaWithEnvironment } from './types';
import { getLambda } from './types';

const PUBLIC_ALLOWED_ORIGINS = [
  'https://chat.craigs.autos',
  'https://craigs.autos',
  'http://localhost:4321',
];

const ADMIN_ALLOWED_ORIGINS = ['https://craigs.autos', 'http://localhost:4321'];

type CreatePublicFunctionUrlArgs = {
  lambda: LambdaWithEnvironment;
  id: string;
  allowedMethods: HttpMethod[];
  allowedOrigins?: string[];
  allowedHeaders?: string[];
};

export type BackendFunctionUrls = {
  chatkitSessionUrl: FunctionUrl;
  chatLeadHandoffUrl: FunctionUrl;
  chatkitMessageLinkUrl: FunctionUrl;
  chatkitLeadSignalUrl: FunctionUrl;
  chatkitLeadAdminUrl: FunctionUrl;
  contactSubmitUrl: FunctionUrl;
};

function createPublicFunctionUrl({
  lambda,
  id,
  allowedMethods,
  allowedOrigins = PUBLIC_ALLOWED_ORIGINS,
  allowedHeaders = ['content-type'],
}: CreatePublicFunctionUrlArgs): FunctionUrl {
  return new FunctionUrl(Stack.of(lambda), id, {
    function: lambda,
    authType: FunctionUrlAuthType.NONE,
    cors: {
      allowedOrigins,
      allowedMethods,
      allowedHeaders,
      // Lambda Function URL CORS maxAge is capped at 86400 seconds.
      maxAge: Duration.days(1),
    },
  });
}

export function createBackendFunctionUrls(backend: CraigsBackend): BackendFunctionUrls {
  return {
    // Creates ChatKit sessions while keeping OpenAI credentials server-side.
    chatkitSessionUrl: createPublicFunctionUrl({
      lambda: getLambda(backend.chatkitSession),
      id: 'ChatkitSessionUrl',
      // Function URL CORS allowMethods does not accept OPTIONS; preflight is automatic.
      allowedMethods: [HttpMethod.POST],
    }),
    // Browser handoff for ready ChatKit threads into the lead workflow.
    chatLeadHandoffUrl: createPublicFunctionUrl({
      lambda: getLambda(backend.chatLeadHandoff),
      id: 'ChatLeadHandoffUrl',
      allowedMethods: [HttpMethod.POST],
    }),
    // /message resolves tokens into SMS/call helper payloads.
    chatkitMessageLinkUrl: createPublicFunctionUrl({
      lambda: getLambda(backend.chatkitMessageLink),
      id: 'ChatkitMessageLinkUrl',
      allowedMethods: [HttpMethod.GET],
    }),
    // Lead signal logging for tel/sms/directions clicks.
    chatkitLeadSignalUrl: createPublicFunctionUrl({
      lambda: getLambda(backend.chatkitLeadSignal),
      id: 'ChatkitLeadSignalUrl',
      allowedMethods: [HttpMethod.POST],
    }),
    // Lead qualification admin API; Lambda still enforces password auth.
    chatkitLeadAdminUrl: createPublicFunctionUrl({
      lambda: getLambda(backend.chatkitLeadAdmin),
      id: 'ChatkitLeadAdminUrl',
      allowedOrigins: ADMIN_ALLOWED_ORIGINS,
      allowedMethods: [HttpMethod.GET, HttpMethod.POST],
      allowedHeaders: ['content-type', 'authorization'],
    }),
    // Public contact/quote submission endpoint.
    contactSubmitUrl: createPublicFunctionUrl({
      lambda: getLambda(backend.contactSubmit),
      id: 'ContactSubmitUrl',
      allowedMethods: [HttpMethod.POST],
    }),
  };
}
