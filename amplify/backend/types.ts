import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import type { Stack } from 'aws-cdk-lib';

export type LambdaWithEnvironment = IFunction & {
  addEnvironment(name: string, value: string): void;
};

export type BackendFunctionResource = {
  resources: {
    lambda: IFunction;
  };
};

export type CraigsBackend = {
  quoteRequestSubmit: BackendFunctionResource;
  leadFollowupWorker: BackendFunctionResource;
  managedConversionFeedbackWorker: BackendFunctionResource;
  chatSessionCreate: BackendFunctionResource;
  chatHandoffPromote: BackendFunctionResource;
  leadActionLinkResolve: BackendFunctionResource;
  leadInteractionCapture: BackendFunctionResource;
  leadAdminApi: BackendFunctionResource;
  addOutput(output: { custom: Record<string, string> }): void;
  createStack(name: string): Stack;
};

export function getLambda(resource: BackendFunctionResource): LambdaWithEnvironment {
  return resource.resources.lambda as LambdaWithEnvironment;
}
