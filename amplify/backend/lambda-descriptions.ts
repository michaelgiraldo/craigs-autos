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
    getLambda(backend.chatSessionCreate),
    'Creates ChatKit sessions and returns ephemeral client secrets with locale, page, user, and shop-time state.',
  );
  setLambdaDescription(
    getLambda(backend.chatHandoffPromote),
    'Hands off ready ChatKit threads into the lead workflow: transcript evaluation, journey persistence, shop email, and QUO SMS when configured.',
  );
  setLambdaDescription(
    getLambda(backend.leadActionLinkResolve),
    'Resolves tokenized message-link payloads into recipient phone and message body for the /message handoff page.',
  );
  setLambdaDescription(
    getLambda(backend.leadInteractionCapture),
    'Logs actionable lead interaction events (call, text, email, directions) and writes normalized lead candidates to DynamoDB.',
  );
  setLambdaDescription(
    getLambda(backend.leadAdminApi),
    'Password-protected admin API to list journeys and lead records and update qualification status for conversion workflows.',
  );
  setLambdaDescription(
    getLambda(backend.quoteRequestSubmit),
    'Accepts public quote requests, stores them in DynamoDB, and asynchronously invokes the lead follow-up worker.',
  );
  setLambdaDescription(
    getLambda(backend.emailIntakeCapture),
    'Processes SES inbound email from Google Workspace routing: validates public contact leads, classifies with OpenAI, queues email-first follow-up, and cleans transient raw email.',
  );
  setLambdaDescription(
    getLambda(backend.leadFollowupWorker),
    'Generates quote outreach drafts, sends SMS-first or email-first follow-up, and emails the shop via SES.',
  );
  setLambdaDescription(
    getLambda(backend.managedConversionFeedbackWorker),
    'Leases managed-conversion feedback outbox items, records provider-neutral outcomes, and prepares safe manual/provider delivery state.',
  );
}
