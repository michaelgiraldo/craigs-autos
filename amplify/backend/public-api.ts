import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { Construct } from 'constructs';

import {
  PUBLIC_API_CONTRACT,
  PUBLIC_API_ROUTES,
  publicApiPath,
} from '@craigs/contracts/public-api-contract';
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
      path: publicApiPath(PUBLIC_API_ROUTES.quoteRequests),
      methods: [HttpMethod.POST],
      integrationId: 'QuoteRequestSubmitIntegration',
      lambda: getLambda(backend.quoteRequestSubmit),
    },
    {
      path: publicApiPath(PUBLIC_API_ROUTES.chatSessions),
      methods: [HttpMethod.POST],
      integrationId: 'ChatSessionCreateIntegration',
      lambda: getLambda(backend.chatSessionCreate),
    },
    {
      path: publicApiPath(PUBLIC_API_ROUTES.chatHandoffs),
      methods: [HttpMethod.POST],
      integrationId: 'ChatHandoffPromoteIntegration',
      lambda: getLambda(backend.chatHandoffPromote),
    },
    {
      path: publicApiPath(PUBLIC_API_ROUTES.leadActionLinks),
      methods: [HttpMethod.GET],
      integrationId: 'LeadActionLinkResolveIntegration',
      lambda: getLambda(backend.leadActionLinkResolve),
    },
    {
      path: publicApiPath(PUBLIC_API_ROUTES.leadInteractions),
      methods: [HttpMethod.POST],
      integrationId: 'LeadInteractionCaptureIntegration',
      lambda: getLambda(backend.leadInteractionCapture),
    },
    {
      path: publicApiPath(PUBLIC_API_ROUTES.adminLeads),
      methods: [HttpMethod.GET],
      integrationId: 'AdminLeadsIntegration',
      lambda: getLambda(backend.leadAdminApi),
    },
    {
      path: publicApiPath(PUBLIC_API_ROUTES.adminLeadQualification),
      methods: [HttpMethod.POST],
      integrationId: 'AdminLeadQualificationIntegration',
      lambda: getLambda(backend.leadAdminApi),
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
      api_contract: PUBLIC_API_CONTRACT,
    },
  });
}
