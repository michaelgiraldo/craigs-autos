import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import type { CraigsBackend } from '../types';
import { getLambda } from '../types';

export function configureLeadActionLinksTable(backend: CraigsBackend): void {
  const messageLinkLambda = getLambda(backend.leadActionLinkResolve);
  const chatHandoffPromoteLambda = getLambda(backend.chatHandoffPromote);
  // Used by tokenized message handoff links in lead notification emails.
  const table = new Table(Stack.of(messageLinkLambda), 'LeadActionLinks', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'token', type: AttributeType.STRING },
    timeToLiveAttribute: 'ttl',
    removalPolicy: RemovalPolicy.DESTROY,
  });

  table.grantReadData(messageLinkLambda);
  table.grantReadWriteData(chatHandoffPromoteLambda);

  messageLinkLambda.addEnvironment('LEAD_ACTION_LINKS_TABLE_NAME', table.tableName);
  chatHandoffPromoteLambda.addEnvironment('LEAD_ACTION_LINKS_TABLE_NAME', table.tableName);
}
