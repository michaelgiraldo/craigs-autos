import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import type { CraigsBackend } from '../types';
import { getLambda } from '../types';

export function configureMessageLinkTokenTable(backend: CraigsBackend): void {
  const messageLinkLambda = getLambda(backend.chatkitMessageLink);
  const chatLeadHandoffLambda = getLambda(backend.chatLeadHandoff);
  // Used by tokenized message handoff links in lead notification emails.
  const table = new Table(Stack.of(messageLinkLambda), 'ChatkitMessageLinkTokenTable', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'token', type: AttributeType.STRING },
    timeToLiveAttribute: 'ttl',
    removalPolicy: RemovalPolicy.RETAIN,
  });

  table.grantReadData(messageLinkLambda);
  table.grantReadWriteData(chatLeadHandoffLambda);

  messageLinkLambda.addEnvironment('MESSAGE_LINK_TOKEN_TABLE_NAME', table.tableName);
  chatLeadHandoffLambda.addEnvironment('MESSAGE_LINK_TOKEN_TABLE_NAME', table.tableName);
}
