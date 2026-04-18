import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { Construct } from 'constructs';

import type { CraigsBackend, LambdaWithEnvironment } from './types';
import { getLambda } from './types';

type OutputTarget = {
  addOutput(output: { custom: Record<string, string> }): void;
};

type RouteConfig = {
  integrationId: string;
  methods: HttpMethod[];
  path: string;
  lambda: LambdaWithEnvironment;
};

const ALLOWED_ORIGINS = [
  'https://chat.craigs.autos',
  'https://craigs.autos',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
];

const PUBLIC_API_ROUTES = {
  contact: '/contact',
  chatSession: '/chat/session',
  chatHandoff: '/chat/handoff',
  chatMessageLink: '/chat/message-link',
  leadSignal: '/lead-signal',
  adminLeads: '/admin/leads',
} as const;

export function createPublicHttpApi(scope: Construct, backend: CraigsBackend): HttpApi {
  const httpApi = new HttpApi(scope, 'PublicHttpApi', {
    apiName: 'craigs-autos-public',
    corsPreflight: {
      allowHeaders: ['authorization', 'content-type'],
      allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST],
      allowOrigins: ALLOWED_ORIGINS,
    },
    createDefaultStage: true,
  });

  const routes: RouteConfig[] = [
    {
      path: PUBLIC_API_ROUTES.contact,
      methods: [HttpMethod.POST],
      integrationId: 'ContactSubmitIntegration',
      lambda: getLambda(backend.contactSubmit),
    },
    {
      path: PUBLIC_API_ROUTES.chatSession,
      methods: [HttpMethod.POST],
      integrationId: 'ChatSessionIntegration',
      lambda: getLambda(backend.chatkitSession),
    },
    {
      path: PUBLIC_API_ROUTES.chatHandoff,
      methods: [HttpMethod.POST],
      integrationId: 'ChatHandoffIntegration',
      lambda: getLambda(backend.chatLeadHandoff),
    },
    {
      path: PUBLIC_API_ROUTES.chatMessageLink,
      methods: [HttpMethod.GET],
      integrationId: 'ChatMessageLinkIntegration',
      lambda: getLambda(backend.chatkitMessageLink),
    },
    {
      path: PUBLIC_API_ROUTES.leadSignal,
      methods: [HttpMethod.POST],
      integrationId: 'LeadSignalIntegration',
      lambda: getLambda(backend.chatkitLeadSignal),
    },
    {
      path: PUBLIC_API_ROUTES.adminLeads,
      methods: [HttpMethod.GET, HttpMethod.POST],
      integrationId: 'AdminLeadsIntegration',
      lambda: getLambda(backend.chatkitLeadAdmin),
    },
  ];

  for (const route of routes) {
    httpApi.addRoutes({
      path: route.path,
      methods: route.methods,
      integration: new HttpLambdaIntegration(route.integrationId, route.lambda),
    });
  }

  return httpApi;
}

export function addPublicApiOutputs(backend: OutputTarget, httpApi: HttpApi): void {
  const apiBaseUrl = httpApi.url ?? `${httpApi.apiEndpoint}/`;

  backend.addOutput({
    custom: {
      api_base_url: apiBaseUrl,
      api_contract: 'craigs-lead-api-v1',
    },
  });
}
