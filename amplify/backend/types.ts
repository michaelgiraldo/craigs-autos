import type { IFunction } from 'aws-cdk-lib/aws-lambda';

export type LambdaWithEnvironment = IFunction & {
  addEnvironment(name: string, value: string): void;
};

export type BackendFunctionResource = {
  resources: {
    lambda: IFunction;
  };
};

export type CraigsBackend = {
  contactSubmit: BackendFunctionResource;
  quoteFollowup: BackendFunctionResource;
  chatkitSession: BackendFunctionResource;
  chatLeadHandoff: BackendFunctionResource;
  chatkitMessageLink: BackendFunctionResource;
  chatkitLeadSignal: BackendFunctionResource;
  chatkitLeadAdmin: BackendFunctionResource;
  addOutput(output: { custom: Record<string, string> }): void;
};

export function getLambda(resource: BackendFunctionResource): LambdaWithEnvironment {
  return resource.resources.lambda as LambdaWithEnvironment;
}
