import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import type { CraigsBackend } from '../types';
import { getLambda } from '../types';

export function configureQuoteSubmissionsTable(backend: CraigsBackend): void {
  const contactSubmitLambda = getLambda(backend.contactSubmit);
  const quoteFollowupLambda = getLambda(backend.quoteFollowup);
  const table = new Table(Stack.of(contactSubmitLambda), 'QuoteSubmissionTable', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'submission_id', type: AttributeType.STRING },
    timeToLiveAttribute: 'ttl',
    removalPolicy: RemovalPolicy.RETAIN,
  });

  table.grantReadWriteData(contactSubmitLambda);
  table.grantReadWriteData(quoteFollowupLambda);
  contactSubmitLambda.addEnvironment('QUOTE_SUBMISSIONS_TABLE_NAME', table.tableName);
  quoteFollowupLambda.addEnvironment('QUOTE_SUBMISSIONS_TABLE_NAME', table.tableName);

  quoteFollowupLambda.grantInvoke(contactSubmitLambda);
  contactSubmitLambda.addEnvironment(
    'QUOTE_FOLLOWUP_FUNCTION_NAME',
    quoteFollowupLambda.functionName,
  );
}
