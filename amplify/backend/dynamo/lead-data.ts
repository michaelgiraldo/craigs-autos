import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import type { CraigsBackend, LambdaWithEnvironment } from '../types';
import { getLambda } from '../types';

type LeadDataTables = {
  contacts: Table;
  conversionDecisions: Table;
  conversionFeedbackOutbox: Table;
  conversionFeedbackOutcomes: Table;
  followupWork: Table;
  journeys: Table;
  journeyEvents: Table;
  providerConversionDestinations: Table;
  records: Table;
};

function createLeadDataTables(stack: Stack): LeadDataTables {
  const contacts = new Table(stack, 'LeadContacts', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'contact_id', type: AttributeType.STRING },
    removalPolicy: RemovalPolicy.DESTROY,
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

  const journeys = new Table(stack, 'LeadJourneys', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'journey_id', type: AttributeType.STRING },
    removalPolicy: RemovalPolicy.DESTROY,
  });

  journeys.addGlobalSecondaryIndex({
    indexName: 'admin_partition-updated_at_ms-index',
    partitionKey: { name: 'admin_partition', type: AttributeType.STRING },
    sortKey: { name: 'updated_at_ms', type: AttributeType.NUMBER },
  });

  const records = new Table(stack, 'LeadRecords', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'lead_record_id', type: AttributeType.STRING },
    removalPolicy: RemovalPolicy.DESTROY,
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

  const journeyEvents = new Table(stack, 'LeadJourneyEvents', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'journey_id', type: AttributeType.STRING },
    sortKey: { name: 'event_sort_key', type: AttributeType.STRING },
    removalPolicy: RemovalPolicy.DESTROY,
  });

  journeyEvents.addGlobalSecondaryIndex({
    indexName: 'lead_record_id-occurred_at_ms-index',
    partitionKey: { name: 'lead_record_id', type: AttributeType.STRING },
    sortKey: { name: 'occurred_at_ms', type: AttributeType.NUMBER },
  });

  const followupWork = new Table(stack, 'LeadFollowupWork', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'followup_work_id', type: AttributeType.STRING },
    timeToLiveAttribute: 'ttl',
    removalPolicy: RemovalPolicy.DESTROY,
  });

  followupWork.addGlobalSecondaryIndex({
    indexName: 'idempotency_key-index',
    partitionKey: { name: 'idempotency_key', type: AttributeType.STRING },
  });

  followupWork.addGlobalSecondaryIndex({
    indexName: 'status-updated_at-index',
    partitionKey: { name: 'status', type: AttributeType.STRING },
    sortKey: { name: 'updated_at', type: AttributeType.NUMBER },
  });

  const conversionDecisions = new Table(stack, 'LeadConversionDecisions', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'decision_id', type: AttributeType.STRING },
    removalPolicy: RemovalPolicy.DESTROY,
  });

  conversionDecisions.addGlobalSecondaryIndex({
    indexName: 'lead_record_id-occurred_at_ms-index',
    partitionKey: { name: 'lead_record_id', type: AttributeType.STRING },
    sortKey: { name: 'occurred_at_ms', type: AttributeType.NUMBER },
  });

  const conversionFeedbackOutbox = new Table(stack, 'LeadConversionFeedbackOutbox', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'outbox_id', type: AttributeType.STRING },
    removalPolicy: RemovalPolicy.DESTROY,
  });

  conversionFeedbackOutbox.addGlobalSecondaryIndex({
    indexName: 'decision_id-updated_at_ms-index',
    partitionKey: { name: 'decision_id', type: AttributeType.STRING },
    sortKey: { name: 'updated_at_ms', type: AttributeType.NUMBER },
  });

  conversionFeedbackOutbox.addGlobalSecondaryIndex({
    indexName: 'lead_record_id-updated_at_ms-index',
    partitionKey: { name: 'lead_record_id', type: AttributeType.STRING },
    sortKey: { name: 'updated_at_ms', type: AttributeType.NUMBER },
  });

  conversionFeedbackOutbox.addGlobalSecondaryIndex({
    indexName: 'status-next_attempt_at_ms-index',
    partitionKey: { name: 'status', type: AttributeType.STRING },
    sortKey: { name: 'next_attempt_at_ms', type: AttributeType.NUMBER },
  });

  const conversionFeedbackOutcomes = new Table(stack, 'LeadConversionFeedbackOutcomes', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'outbox_id', type: AttributeType.STRING },
    sortKey: { name: 'outcome_sort_key', type: AttributeType.STRING },
    removalPolicy: RemovalPolicy.DESTROY,
  });

  conversionFeedbackOutcomes.addGlobalSecondaryIndex({
    indexName: 'lead_record_id-occurred_at_ms-index',
    partitionKey: { name: 'lead_record_id', type: AttributeType.STRING },
    sortKey: { name: 'occurred_at_ms', type: AttributeType.NUMBER },
  });

  const providerConversionDestinations = new Table(stack, 'ProviderConversionDestinations', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'destination_key', type: AttributeType.STRING },
    removalPolicy: RemovalPolicy.DESTROY,
  });

  providerConversionDestinations.addGlobalSecondaryIndex({
    indexName: 'enabled_partition-updated_at_ms-index',
    partitionKey: { name: 'enabled_partition', type: AttributeType.STRING },
    sortKey: { name: 'updated_at_ms', type: AttributeType.NUMBER },
  });

  return {
    contacts,
    conversionDecisions,
    conversionFeedbackOutbox,
    conversionFeedbackOutcomes,
    followupWork,
    journeys,
    journeyEvents,
    providerConversionDestinations,
    records,
  };
}

function grantLeadDataAccess(lambda: LambdaWithEnvironment, tables: LeadDataTables): void {
  tables.contacts.grantReadWriteData(lambda);
  tables.conversionDecisions.grantReadWriteData(lambda);
  tables.conversionFeedbackOutbox.grantReadWriteData(lambda);
  tables.conversionFeedbackOutcomes.grantReadWriteData(lambda);
  tables.followupWork.grantReadWriteData(lambda);
  tables.journeys.grantReadWriteData(lambda);
  tables.journeyEvents.grantReadWriteData(lambda);
  tables.providerConversionDestinations.grantReadWriteData(lambda);
  tables.records.grantReadWriteData(lambda);

  lambda.addEnvironment('LEAD_CONTACTS_TABLE_NAME', tables.contacts.tableName);
  lambda.addEnvironment(
    'LEAD_CONVERSION_DECISIONS_TABLE_NAME',
    tables.conversionDecisions.tableName,
  );
  lambda.addEnvironment(
    'LEAD_CONVERSION_FEEDBACK_OUTBOX_TABLE_NAME',
    tables.conversionFeedbackOutbox.tableName,
  );
  lambda.addEnvironment(
    'LEAD_CONVERSION_FEEDBACK_OUTCOMES_TABLE_NAME',
    tables.conversionFeedbackOutcomes.tableName,
  );
  lambda.addEnvironment('LEAD_FOLLOWUP_WORK_TABLE_NAME', tables.followupWork.tableName);
  lambda.addEnvironment('LEAD_JOURNEYS_TABLE_NAME', tables.journeys.tableName);
  lambda.addEnvironment('LEAD_JOURNEY_EVENTS_TABLE_NAME', tables.journeyEvents.tableName);
  lambda.addEnvironment(
    'PROVIDER_CONVERSION_DESTINATIONS_TABLE_NAME',
    tables.providerConversionDestinations.tableName,
  );
  lambda.addEnvironment('LEAD_RECORDS_TABLE_NAME', tables.records.tableName);
}

export function configureLeadDataTables(backend: CraigsBackend): void {
  // Journey-first lead substrate used by click, chat, and form capture flows.
  const leadDataStack = Stack.of(getLambda(backend.chatHandoffPromote));
  const tables = createLeadDataTables(leadDataStack);
  const leadFollowupWorkerLambda = getLambda(backend.leadFollowupWorker);
  const followupProducers = [
    getLambda(backend.quoteRequestSubmit),
    getLambda(backend.emailIntakeCapture),
    getLambda(backend.chatHandoffPromote),
  ];

  for (const lambda of [
    ...followupProducers,
    leadFollowupWorkerLambda,
    getLambda(backend.managedConversionFeedbackWorker),
    getLambda(backend.leadInteractionCapture),
    getLambda(backend.leadAdminApi),
  ]) {
    grantLeadDataAccess(lambda, tables);
  }

  for (const lambda of followupProducers) {
    leadFollowupWorkerLambda.grantInvoke(lambda);
    lambda.addEnvironment(
      'LEAD_FOLLOWUP_WORKER_FUNCTION_NAME',
      leadFollowupWorkerLambda.functionName,
    );
  }
}
