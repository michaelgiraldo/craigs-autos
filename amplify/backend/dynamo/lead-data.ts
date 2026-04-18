import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import type { CraigsBackend, LambdaWithEnvironment } from '../types';
import { getLambda } from '../types';

type LeadDataTables = {
  contacts: Table;
  journeys: Table;
  journeyEvents: Table;
  records: Table;
};

function createLeadDataTables(stack: Stack): LeadDataTables {
  const contacts = new Table(stack, 'LeadContactsTable', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'contact_id', type: AttributeType.STRING },
    removalPolicy: RemovalPolicy.RETAIN,
  });

  contacts.addGlobalSecondaryIndex({
    indexName: 'normalized_phone-index',
    partitionKey: { name: 'normalized_phone', type: AttributeType.STRING },
  });

  contacts.addGlobalSecondaryIndex({
    indexName: 'normalized_email-index',
    partitionKey: { name: 'normalized_email', type: AttributeType.STRING },
  });

  contacts.addGlobalSecondaryIndex({
    indexName: 'quo_contact_id-index',
    partitionKey: { name: 'quo_contact_id', type: AttributeType.STRING },
  });

  const journeys = new Table(stack, 'LeadJourneysTable', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'journey_id', type: AttributeType.STRING },
    removalPolicy: RemovalPolicy.RETAIN,
  });

  journeys.addGlobalSecondaryIndex({
    indexName: 'admin_partition-updated_at_ms-index',
    partitionKey: { name: 'admin_partition', type: AttributeType.STRING },
    sortKey: { name: 'updated_at_ms', type: AttributeType.NUMBER },
  });

  const records = new Table(stack, 'LeadRecordsTable', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'lead_record_id', type: AttributeType.STRING },
    removalPolicy: RemovalPolicy.RETAIN,
  });

  records.addGlobalSecondaryIndex({
    indexName: 'contact_id-updated_at_ms-index',
    partitionKey: { name: 'contact_id', type: AttributeType.STRING },
    sortKey: { name: 'updated_at_ms', type: AttributeType.NUMBER },
  });

  records.addGlobalSecondaryIndex({
    indexName: 'admin_partition-updated_at_ms-index',
    partitionKey: { name: 'admin_partition', type: AttributeType.STRING },
    sortKey: { name: 'updated_at_ms', type: AttributeType.NUMBER },
  });

  records.addGlobalSecondaryIndex({
    indexName: 'status-updated_at_ms-index',
    partitionKey: { name: 'status', type: AttributeType.STRING },
    sortKey: { name: 'updated_at_ms', type: AttributeType.NUMBER },
  });

  const journeyEvents = new Table(stack, 'LeadJourneyEventsTable', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'journey_id', type: AttributeType.STRING },
    sortKey: { name: 'event_sort_key', type: AttributeType.STRING },
    removalPolicy: RemovalPolicy.RETAIN,
  });

  journeyEvents.addGlobalSecondaryIndex({
    indexName: 'lead_record_id-occurred_at_ms-index',
    partitionKey: { name: 'lead_record_id', type: AttributeType.STRING },
    sortKey: { name: 'occurred_at_ms', type: AttributeType.NUMBER },
  });

  return { contacts, journeys, journeyEvents, records };
}

function grantLeadDataAccess(lambda: LambdaWithEnvironment, tables: LeadDataTables): void {
  tables.contacts.grantReadWriteData(lambda);
  tables.journeys.grantReadWriteData(lambda);
  tables.journeyEvents.grantReadWriteData(lambda);
  tables.records.grantReadWriteData(lambda);

  lambda.addEnvironment('LEAD_CONTACTS_TABLE_NAME', tables.contacts.tableName);
  lambda.addEnvironment('LEAD_JOURNEYS_TABLE_NAME', tables.journeys.tableName);
  lambda.addEnvironment('LEAD_JOURNEY_EVENTS_TABLE_NAME', tables.journeyEvents.tableName);
  lambda.addEnvironment('LEAD_RECORDS_TABLE_NAME', tables.records.tableName);
}

export function configureLeadDataTables(backend: CraigsBackend): void {
  // Journey-first lead substrate used by click, chat, and form capture flows.
  const leadDataStack = Stack.of(getLambda(backend.chatLeadHandoff));
  const tables = createLeadDataTables(leadDataStack);

  for (const lambda of [
    getLambda(backend.contactSubmit),
    getLambda(backend.quoteFollowup),
    getLambda(backend.chatLeadHandoff),
    getLambda(backend.chatkitLeadSignal),
    getLambda(backend.chatkitLeadAdmin),
  ]) {
    grantLeadDataAccess(lambda, tables);
  }
}
