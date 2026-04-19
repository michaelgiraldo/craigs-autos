import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import type { CraigsBackend } from '../types';
import { getLambda } from '../types';

export function configureChatHandoffPromoteDedupeTable(backend: CraigsBackend): void {
  const chatHandoffPromoteLambda = getLambda(backend.chatHandoffPromote);
  // Production-grade idempotency: one completed handoff per ChatKit thread (`cthr_...`),
  // even when multiple browser lifecycle events trigger the endpoint.
  const table = new Table(Stack.of(chatHandoffPromoteLambda), 'ChatHandoffDispatchLedger', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'thread_id', type: AttributeType.STRING },
    timeToLiveAttribute: 'ttl',
    removalPolicy: RemovalPolicy.DESTROY,
  });

  table.grantReadWriteData(chatHandoffPromoteLambda);
  chatHandoffPromoteLambda.addEnvironment('LEAD_DEDUPE_TABLE_NAME', table.tableName);
}
