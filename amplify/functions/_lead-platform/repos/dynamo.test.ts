import assert from 'node:assert/strict';
import test from 'node:test';
import type { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  DynamoLeadConversionFeedbackOutboxRepo,
  DynamoJourneysRepo,
  DynamoLeadContactsRepo,
  DynamoLeadRecordsRepo,
  DynamoProviderConversionDestinationsRepo,
} from './dynamo.ts';
import type { LeadContact } from '../domain/contact.ts';
import type { LeadRecord } from '../domain/lead-record.ts';

function createDbStub() {
  const commands: unknown[] = [];
  return {
    db: {
      async send(command: unknown) {
        commands.push(command);
        return {};
      },
    },
    commands,
  };
}

test('DynamoLeadContactsRepo.put omits null-valued GSI keys', async () => {
  const { db, commands } = createDbStub();
  const repo = new DynamoLeadContactsRepo(db as never, 'LeadContactsTable');
  const contact: LeadContact = {
    contact_id: 'contact_123',
    normalized_phone: '+12025550123',
    normalized_email: null,
    first_name: 'Codex',
    last_name: 'Smoke',
    display_name: 'Codex Smoke',
    raw_phone: '(202) 555-0123',
    raw_email: null,
    quo_contact_id: null,
    quo_tags: [],
    created_at_ms: 1,
    updated_at_ms: 1,
  };

  await repo.put(contact);

  assert.equal(commands.length, 1);
  const command = commands[0] as PutCommand & { input: Record<string, unknown> };
  assert.equal(command.input.TableName, 'LeadContactsTable');
  assert.deepEqual(command.input.Item, {
    contact_id: 'contact_123',
    normalized_phone: '+12025550123',
    first_name: 'Codex',
    last_name: 'Smoke',
    display_name: 'Codex Smoke',
    raw_phone: '(202) 555-0123',
    raw_email: null,
    quo_tags: [],
    created_at_ms: 1,
    updated_at_ms: 1,
  });
});

test('DynamoLeadRecordsRepo.put omits null contact_id before writing', async () => {
  const { db, commands } = createDbStub();
  const repo = new DynamoLeadRecordsRepo(db as never, 'LeadRecordsTable');
  const leadRecord: LeadRecord = {
    lead_record_id: 'lead_123',
    journey_id: 'journey_123',
    contact_id: null,
    status: 'new',
    capture_channel: 'chat',
    title: 'Smoke lead',
    vehicle: null,
    service: null,
    project_summary: null,
    customer_message: null,
    customer_language: null,
    attribution: null,
    latest_outreach: {
      channel: null,
      status: 'not_attempted',
      provider: null,
      external_id: null,
      error: null,
      sent_at_ms: null,
    },
    qualification: {
      qualified: false,
      qualified_at_ms: null,
    },
    first_action: null,
    latest_action: null,
    action_types: [],
    action_count: 0,
    created_at_ms: 1,
    updated_at_ms: 1,
  };

  await repo.put(leadRecord);

  assert.equal(commands.length, 1);
  const command = commands[0] as PutCommand & { input: Record<string, unknown> };
  assert.equal(command.input.TableName, 'LeadRecordsTable');
  assert.deepEqual(command.input.Item, {
    lead_record_id: 'lead_123',
    journey_id: 'journey_123',
    admin_partition: 'all',
    qualification_partition: 'unqualified',
    status: 'new',
    capture_channel: 'chat',
    title: 'Smoke lead',
    vehicle: null,
    service: null,
    project_summary: null,
    customer_message: null,
    customer_language: null,
    attribution: null,
    latest_outreach: {
      channel: null,
      status: 'not_attempted',
      provider: null,
      external_id: null,
      error: null,
      sent_at_ms: null,
    },
    qualification: {
      qualified: false,
      qualified_at_ms: null,
    },
    first_action: null,
    latest_action: null,
    action_types: [],
    action_count: 0,
    created_at_ms: 1,
    updated_at_ms: 1,
  });
});

test('DynamoLeadRecordsRepo.listPage queries the ordered admin index', async () => {
  const { db, commands } = createDbStub();
  const repo = new DynamoLeadRecordsRepo(db as never, 'LeadRecordsTable');

  await repo.listPage({
    limit: 25,
    qualifiedFilter: true,
    cursor: { lead_record_id: 'cursor-id' },
  });

  assert.equal(commands.length, 1);
  const command = commands[0] as QueryCommand & { input: Record<string, unknown> };
  assert.equal(command.input.TableName, 'LeadRecordsTable');
  assert.equal(command.input.IndexName, 'admin_partition-updated_at_ms-index');
  assert.equal(command.input.FilterExpression, 'qualification_partition = :qualificationPartition');
  assert.equal(command.input.ScanIndexForward, false);
});

test('DynamoJourneysRepo.listPage queries the ordered admin index', async () => {
  const { db, commands } = createDbStub();
  const repo = new DynamoJourneysRepo(db as never, 'LeadJourneysTable');

  await repo.listPage({
    limit: 25,
    cursor: { journey_id: 'journey-cursor' },
  });

  assert.equal(commands.length, 1);
  const command = commands[0] as QueryCommand & { input: Record<string, unknown> };
  assert.equal(command.input.TableName, 'LeadJourneysTable');
  assert.equal(command.input.IndexName, 'admin_partition-updated_at_ms-index');
  assert.equal(command.input.ScanIndexForward, false);
});

test('DynamoLeadConversionFeedbackOutboxRepo.listByStatus queries retry-ready status index', async () => {
  const { db, commands } = createDbStub();
  const repo = new DynamoLeadConversionFeedbackOutboxRepo(db as never, 'FeedbackOutboxTable');

  await repo.listByStatus('queued', { dueAtMs: 5_000, limit: 10 });

  assert.equal(commands.length, 1);
  const command = commands[0] as QueryCommand & { input: Record<string, unknown> };
  assert.equal(command.input.TableName, 'FeedbackOutboxTable');
  assert.equal(command.input.IndexName, 'status-next_attempt_at_ms-index');
  assert.equal(
    command.input.KeyConditionExpression,
    '#status = :status AND next_attempt_at_ms <= :dueAtMs',
  );
  assert.equal(command.input.ScanIndexForward, true);
  assert.equal(command.input.Limit, 10);
});

test('DynamoLeadConversionFeedbackOutboxRepo.acquireLease conditionally leases queued work', async () => {
  const { db, commands } = createDbStub();
  const repo = new DynamoLeadConversionFeedbackOutboxRepo(db as never, 'FeedbackOutboxTable');

  await repo.acquireLease({
    outboxId: 'outbox-1',
    expectedStatus: 'queued',
    leaseOwner: 'worker-1',
    leaseExpiresAtMs: 10_000,
    nowMs: 5_000,
    statusReason: 'Leased by worker-1.',
  });

  assert.equal(commands.length, 1);
  const command = commands[0] as UpdateCommand & { input: Record<string, unknown> };
  assert.equal(command.input.TableName, 'FeedbackOutboxTable');
  assert.deepEqual(command.input.Key, { outbox_id: 'outbox-1' });
  assert.equal(
    command.input.ConditionExpression,
    '#status = :expectedStatus AND (attribute_not_exists(lease_expires_at_ms) OR lease_expires_at_ms <= :nowMs)',
  );
  assert.doesNotMatch(String(command.input.UpdateExpression), /REMOVE next_attempt_at_ms/);
});

test('DynamoLeadConversionFeedbackOutboxRepo.put omits null retry index key', async () => {
  const { db, commands } = createDbStub();
  const repo = new DynamoLeadConversionFeedbackOutboxRepo(db as never, 'FeedbackOutboxTable');

  await repo.put({
    outbox_id: 'outbox-1',
    decision_id: 'decision-1',
    lead_record_id: 'lead-1',
    journey_id: 'journey-1',
    destination_key: 'google_ads',
    destination_label: 'Google Ads',
    status: 'suppressed',
    status_reason: 'Lead was unqualified.',
    signal_keys: ['gclid'],
    dedupe_key: 'decision-1:google_ads',
    payload_contract: 'craigs-managed-conversions-v1',
    attempt_count: 0,
    lease_owner: null,
    lease_expires_at_ms: null,
    next_attempt_at_ms: null,
    last_outcome_at_ms: 2,
    created_at_ms: 1,
    updated_at_ms: 2,
  });

  const command = commands[0] as PutCommand & { input: Record<string, unknown> };
  assert.equal(command.input.TableName, 'FeedbackOutboxTable');
  assert.equal((command.input.Item as Record<string, unknown>).lease_owner, undefined);
  assert.equal((command.input.Item as Record<string, unknown>).lease_expires_at_ms, undefined);
  assert.equal((command.input.Item as Record<string, unknown>).next_attempt_at_ms, undefined);
  assert.equal((command.input.Item as Record<string, unknown>).last_outcome_at_ms, 2);
});

test('DynamoProviderConversionDestinationsRepo.put adds enabled partition only when enabled', async () => {
  const { db, commands } = createDbStub();
  const repo = new DynamoProviderConversionDestinationsRepo(db as never, 'DestinationsTable');

  await repo.put({
    destination_key: 'google_ads',
    destination_label: 'Google Ads',
    enabled: true,
    delivery_mode: 'provider_api',
    config_source: 'environment',
    provider_config: {},
    created_at_ms: 1,
    updated_at_ms: 1,
  });

  assert.equal(commands.length, 1);
  const command = commands[0] as PutCommand & { input: Record<string, unknown> };
  assert.equal(command.input.TableName, 'DestinationsTable');
  assert.deepEqual(command.input.Item, {
    destination_key: 'google_ads',
    destination_label: 'Google Ads',
    enabled: true,
    enabled_partition: 'enabled',
    delivery_mode: 'provider_api',
    config_source: 'environment',
    provider_config: {},
    created_at_ms: 1,
    updated_at_ms: 1,
  });
});
