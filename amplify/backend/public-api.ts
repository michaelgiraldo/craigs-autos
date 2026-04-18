import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { Construct } from 'constructs';

import {
  PUBLIC_API_CONTRACT,
  PUBLIC_API_ROUTES,
  publicApiPath,
} from '../../shared/public-api-contract.js';
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
      path: publicApiPath(PUBLIC_API_ROUTES.contact),
      methods: [HttpMethod.POST],
      integrationId: 'ContactSubmitIntegration',
      lambda: getLambda(backend.contactSubmit),
    },
    {
      path: publicApiPath(PUBLIC_API_ROUTES.chatSession),
      methods: [HttpMethod.POST],
      integrationId: 'ChatSessionIntegration',
      lambda: getLambda(backend.chatkitSession),
    },
    {
      path: publicApiPath(PUBLIC_API_ROUTES.chatHandoff),
      methods: [HttpMethod.POST],
      integrationId: 'ChatHandoffIntegration',
      lambda: getLambda(backend.chatLeadHandoff),
    },
    {
      path: publicApiPath(PUBLIC_API_ROUTES.chatMessageLink),
      methods: [HttpMethod.GET],
      integrationId: 'ChatMessageLinkIntegration',
      lambda: getLambda(backend.chatkitMessageLink),
    },
    {
      path: publicApiPath(PUBLIC_API_ROUTES.leadSignal),
      methods: [HttpMethod.POST],
      integrationId: 'LeadSignalIntegration',
      lambda: getLambda(backend.chatkitLeadSignal),
    },
    {
      path: publicApiPath(PUBLIC_API_ROUTES.adminLeads),
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
      api_contract: PUBLIC_API_CONTRACT,
    },
  });
}
