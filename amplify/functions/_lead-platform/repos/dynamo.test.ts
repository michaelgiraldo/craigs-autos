import assert from 'node:assert/strict';
import test from 'node:test';
import type { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoJourneysRepo, DynamoLeadContactsRepo, DynamoLeadRecordsRepo } from './dynamo.ts';
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
      uploaded_google_ads: false,
      uploaded_google_ads_at_ms: null,
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
      uploaded_google_ads: false,
      uploaded_google_ads_at_ms: null,
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
