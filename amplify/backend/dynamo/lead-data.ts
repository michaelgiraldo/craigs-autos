import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { CraigsBackend, LambdaWithEnvironment } from '../types';
import { getLambda } from '../types';

type LeadDataTables = {
  contacts: Table;
  contactObservations: Table;
  contactPoints: Table;
  conversionDecisions: Table;
  conversionFeedbackOutbox: Table;
  conversionFeedbackOutcomes: Table;
  followupWork: Table;
  journeys: Table;
  journeyEvents: Table;
  providerConversionDestinations: Table;
  providerContactProjections: Table;
  records: Table;
};

const DURABLE_LEAD_TABLE_BACKUP_PROPS = {
  pointInTimeRecoverySpecification: {
    pointInTimeRecoveryEnabled: true,
    recoveryPeriodInDays: 35,
  },
} as const;

const DYNAMODB_READ_WRITE_ACTIONS = [
  'dynamodb:BatchGetItem',
  'dynamodb:BatchWriteItem',
  'dynamodb:ConditionCheckItem',
  'dynamodb:DeleteItem',
  'dynamodb:DescribeTable',
  'dynamodb:GetItem',
  'dynamodb:PutItem',
  'dynamodb:Query',
  'dynamodb:Scan',
  'dynamodb:UpdateItem',
] as const;

function createLeadDataTables(stack: Stack): LeadDataTables {
  const contacts = new Table(stack, 'LeadContacts', {
    ...DURABLE_LEAD_TABLE_BACKUP_PROPS,
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

  const contactPoints = new Table(stack, 'LeadContactPoints', {
    ...DURABLE_LEAD_TABLE_BACKUP_PROPS,
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'contact_point_id', type: AttributeType.STRING },
    removalPolicy: RemovalPolicy.DESTROY,
  });

  contactPoints.addGlobalSecondaryIndex({
    indexName: 'normalized_value-index',
    partitionKey: { name: 'normalized_value', type: AttributeType.STRING },
  });

  contactPoints.addGlobalSecondaryIndex({
    indexName: 'contact_id-index',
    partitionKey: { name: 'contact_id', type: AttributeType.STRING },
  });

  const contactObservations = new Table(stack, 'LeadContactObservations', {
    ...DURABLE_LEAD_TABLE_BACKUP_PROPS,
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'contact_id', type: AttributeType.STRING },
    sortKey: { name: 'observation_sort_key', type: AttributeType.STRING },
    removalPolicy: RemovalPolicy.DESTROY,
  });

  contactObservations.addGlobalSecondaryIndex({
    indexName: 'source_event_id-index',
    partitionKey: { name: 'source_event_id', type: AttributeType.STRING },
  });

  const providerContactProjections = new Table(stack, 'LeadProviderContactProjections', {
    ...DURABLE_LEAD_TABLE_BACKUP_PROPS,
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'projection_id', type: AttributeType.STRING },
    removalPolicy: RemovalPolicy.DESTROY,
  });

  providerContactProjections.addGlobalSecondaryIndex({
    indexName: 'contact_id-index',
    partitionKey: { name: 'contact_id', type: AttributeType.STRING },
  });

  providerContactProjections.addGlobalSecondaryIndex({
    indexName: 'provider_external_id-index',
    partitionKey: { name: 'provider_external_id', type: AttributeType.STRING },
  });

  const journeys = new Table(stack, 'LeadJourneys', {
    ...DURABLE_LEAD_TABLE_BACKUP_PROPS,
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
    ...DURABLE_LEAD_TABLE_BACKUP_PROPS,
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
    ...DURABLE_LEAD_TABLE_BACKUP_PROPS,
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
    partitionKey: { name: 'idempotency_key', type: AttributeType.STRING },
    timeToLiveAttribute: 'ttl',
    removalPolicy: RemovalPolicy.DESTROY,
  });

  followupWork.addGlobalSecondaryIndex({
    indexName: 'status-updated_at-index',
    partitionKey: { name: 'status', type: AttributeType.STRING },
    sortKey: { name: 'updated_at', type: AttributeType.NUMBER },
  });

  const conversionDecisions = new Table(stack, 'LeadConversionDecisions', {
    ...DURABLE_LEAD_TABLE_BACKUP_PROPS,
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
    ...DURABLE_LEAD_TABLE_BACKUP_PROPS,
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
    ...DURABLE_LEAD_TABLE_BACKUP_PROPS,
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
    ...DURABLE_LEAD_TABLE_BACKUP_PROPS,
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
    contactObservations,
    contactPoints,
    conversionDecisions,
    conversionFeedbackOutbox,
    conversionFeedbackOutcomes,
    followupWork,
    journeys,
    journeyEvents,
    providerConversionDestinations,
    providerContactProjections,
    records,
  };
}

function addLeadDataEnvironment(lambda: LambdaWithEnvironment, tables: LeadDataTables): void {
  lambda.addEnvironment(
    'LEAD_CONTACT_OBSERVATIONS_TABLE_NAME',
    tables.contactObservations.tableName,
  );
  lambda.addEnvironment('LEAD_CONTACT_POINTS_TABLE_NAME', tables.contactPoints.tableName);
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
    'LEAD_PROVIDER_CONTACT_PROJECTIONS_TABLE_NAME',
    tables.providerContactProjections.tableName,
  );
  lambda.addEnvironment(
    'PROVIDER_CONVERSION_DESTINATIONS_TABLE_NAME',
    tables.providerConversionDestinations.tableName,
  );
  lambda.addEnvironment('LEAD_RECORDS_TABLE_NAME', tables.records.tableName);
}

function grantLeadTableReadWriteAccess(lambda: LambdaWithEnvironment, tables: Table[]): void {
  lambda.addToRolePolicy(
    new PolicyStatement({
      actions: [...DYNAMODB_READ_WRITE_ACTIONS],
      resources: tables.flatMap((table) => [table.tableArn, `${table.tableArn}/index/*`]),
    }),
  );
}

function grantLeadCaptureAccess(lambda: LambdaWithEnvironment, tables: LeadDataTables): void {
  grantLeadTableReadWriteAccess(lambda, [
    tables.contactObservations,
    tables.contactPoints,
    tables.contacts,
    tables.followupWork,
    tables.journeys,
    tables.journeyEvents,
    tables.records,
    tables.providerContactProjections,
  ]);
}

function grantManagedConversionAccess(lambda: LambdaWithEnvironment, tables: LeadDataTables): void {
  grantLeadTableReadWriteAccess(lambda, [
    tables.contactObservations,
    tables.contactPoints,
    tables.contacts,
    tables.conversionDecisions,
    tables.conversionFeedbackOutbox,
    tables.conversionFeedbackOutcomes,
    tables.providerConversionDestinations,
    tables.providerContactProjections,
    tables.records,
  ]);
}

function grantLeadAdminAccess(lambda: LambdaWithEnvironment, tables: LeadDataTables): void {
  grantLeadTableReadWriteAccess(lambda, [
    tables.contactObservations,
    tables.contactPoints,
    tables.contacts,
    tables.conversionDecisions,
    tables.conversionFeedbackOutbox,
    tables.conversionFeedbackOutcomes,
    tables.followupWork,
    tables.journeys,
    tables.journeyEvents,
    tables.providerConversionDestinations,
    tables.providerContactProjections,
    tables.records,
  ]);
}

export function configureLeadDataTables(backend: CraigsBackend): void {
  // Journey-first lead substrate used by click, chat, and form capture flows.
  const leadDataStack = Stack.of(getLambda(backend.chatHandoffPromote));
  const tables = createLeadDataTables(leadDataStack);
  const leadFollowupWorkerLambda = getLambda(backend.leadFollowupWorker);
  const leadFollowupAlertMonitorLambda = getLambda(backend.leadFollowupAlertMonitor);
  const followupProducers = [
    getLambda(backend.quoteRequestSubmit),
    getLambda(backend.emailIntakeCapture),
    getLambda(backend.chatHandoffPromote),
  ];
  const leadInteractionCaptureLambda = getLambda(backend.leadInteractionCapture);
  const managedConversionFeedbackWorkerLambda = getLambda(backend.managedConversionFeedbackWorker);
  const leadAdminApiLambda = getLambda(backend.leadAdminApi);

  for (const lambda of [
    ...followupProducers,
    leadFollowupWorkerLambda,
    managedConversionFeedbackWorkerLambda,
    leadInteractionCaptureLambda,
    leadAdminApiLambda,
  ]) {
    addLeadDataEnvironment(lambda, tables);
  }

  for (const lambda of [
    ...followupProducers,
    leadFollowupWorkerLambda,
    leadInteractionCaptureLambda,
  ]) {
    grantLeadCaptureAccess(lambda, tables);
  }

  grantManagedConversionAccess(managedConversionFeedbackWorkerLambda, tables);
  grantLeadAdminAccess(leadAdminApiLambda, tables);
  leadFollowupAlertMonitorLambda.addEnvironment(
    'LEAD_FOLLOWUP_WORK_TABLE_NAME',
    tables.followupWork.tableName,
  );
  grantLeadTableReadWriteAccess(leadFollowupAlertMonitorLambda, [tables.followupWork]);

  for (const lambda of followupProducers) {
    leadFollowupWorkerLambda.grantInvoke(lambda);
    lambda.addEnvironment(
      'LEAD_FOLLOWUP_WORKER_FUNCTION_NAME',
      leadFollowupWorkerLambda.functionName,
    );
  }

  leadFollowupWorkerLambda.grantInvoke(leadAdminApiLambda);
  leadAdminApiLambda.addEnvironment(
    'LEAD_FOLLOWUP_WORKER_FUNCTION_NAME',
    leadFollowupWorkerLambda.functionName,
  );
}
