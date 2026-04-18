import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import type { CraigsBackend } from '../types';
import { getLambda } from '../types';

export function configureChatLeadHandoffDedupeTable(backend: CraigsBackend): void {
  const chatLeadHandoffLambda = getLambda(backend.chatLeadHandoff);
  // Production-grade idempotency: one completed handoff per ChatKit thread (`cthr_...`),
  // even when multiple browser lifecycle events trigger the endpoint.
  const table = new Table(Stack.of(chatLeadHandoffLambda), 'ChatLeadHandoffDedupeTable', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'thread_id', type: AttributeType.STRING },
    timeToLiveAttribute: 'ttl',
    // Safe default for production; deleting the Amplify environment retains this table.
    removalPolicy: RemovalPolicy.RETAIN,
  });

  table.grantReadWriteData(chatLeadHandoffLambda);
  chatLeadHandoffLambda.addEnvironment('LEAD_DEDUPE_TABLE_NAME', table.tableName);
}
