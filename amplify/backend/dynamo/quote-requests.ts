import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import type { CraigsBackend } from '../types';
import { getLambda } from '../types';

export function configureQuoteRequestsTable(backend: CraigsBackend): void {
  const quoteRequestSubmitLambda = getLambda(backend.quoteRequestSubmit);
  const emailIntakeCaptureLambda = getLambda(backend.emailIntakeCapture);
  const leadFollowupWorkerLambda = getLambda(backend.leadFollowupWorker);
  const table = new Table(Stack.of(quoteRequestSubmitLambda), 'QuoteRequests', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'quote_request_id', type: AttributeType.STRING },
    timeToLiveAttribute: 'ttl',
    removalPolicy: RemovalPolicy.DESTROY,
  });

  table.grantReadWriteData(quoteRequestSubmitLambda);
  table.grantReadWriteData(emailIntakeCaptureLambda);
  table.grantReadWriteData(leadFollowupWorkerLambda);
  quoteRequestSubmitLambda.addEnvironment('QUOTE_REQUESTS_TABLE_NAME', table.tableName);
  emailIntakeCaptureLambda.addEnvironment('QUOTE_REQUESTS_TABLE_NAME', table.tableName);
  leadFollowupWorkerLambda.addEnvironment('QUOTE_REQUESTS_TABLE_NAME', table.tableName);

  leadFollowupWorkerLambda.grantInvoke(quoteRequestSubmitLambda);
  leadFollowupWorkerLambda.grantInvoke(emailIntakeCaptureLambda);
  quoteRequestSubmitLambda.addEnvironment(
    'LEAD_FOLLOWUP_WORKER_FUNCTION_NAME',
    leadFollowupWorkerLambda.functionName,
  );
  emailIntakeCaptureLambda.addEnvironment(
    'LEAD_FOLLOWUP_WORKER_FUNCTION_NAME',
    leadFollowupWorkerLambda.functionName,
  );
}
