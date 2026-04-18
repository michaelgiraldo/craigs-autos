import { CfnFunction } from 'aws-cdk-lib/aws-lambda';
import type { CraigsBackend, LambdaWithEnvironment } from './types';
import { getLambda } from './types';

function setLambdaDescription(resource: LambdaWithEnvironment, description: string): void {
  const cfn = resource.node?.defaultChild;
  if (cfn instanceof CfnFunction) {
    cfn.addPropertyOverride('Description', description);
    return;
  }
  // Fallback for interface-typed resources where the underlying child is still a CfnFunction.
  const overrideTarget = cfn as { addPropertyOverride?: (path: string, value: unknown) => void };
  if (typeof overrideTarget.addPropertyOverride === 'function') {
    overrideTarget.addPropertyOverride('Description', description);
    return;
  }
  throw new Error('Unable to set Lambda description: missing CfnFunction default child');
}

export function applyLambdaDescriptions(backend: CraigsBackend): void {
  setLambdaDescription(
    getLambda(backend.chatkitSession),
    'Creates ChatKit sessions and returns ephemeral client secrets with locale, page, user, and shop-time state.',
  );
  setLambdaDescription(
    getLambda(backend.chatLeadHandoff),
    'Hands off ready ChatKit threads into the lead workflow: transcript evaluation, journey persistence, shop email, and QUO SMS when configured.',
  );
  setLambdaDescription(
    getLambda(backend.chatkitMessageLink),
    'Resolves tokenized message-link payloads into recipient phone and message body for the /message handoff page.',
  );
  setLambdaDescription(
    getLambda(backend.chatkitLeadSignal),
    'Logs actionable lead interaction events (call, text, email, directions) and writes normalized lead candidates to DynamoDB.',
  );
  setLambdaDescription(
    getLambda(backend.chatkitLeadAdmin),
    'Password-protected admin API to list journeys and lead records and update qualification status for conversion workflows.',
  );
  setLambdaDescription(
    getLambda(backend.contactSubmit),
    'Accepts public quote requests, stores them in DynamoDB, and asynchronously invokes the quote follow-up worker.',
  );
  setLambdaDescription(
    getLambda(backend.quoteFollowup),
    'Generates quote outreach drafts, sends SMS-first follow-up with email fallback, and emails the shop via SES.',
  );
}
