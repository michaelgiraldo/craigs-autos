import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type { LeadActionToken, Journey, JourneyEvent, LeadContact, LeadRecord, LeadRecordStatus } from '../domain/types.ts';
import type { LeadActionTokensRepo } from './action-tokens-repo.ts';
import type { LeadContactsRepo } from './contacts-repo.ts';
import type { JourneyEventsRepo } from './events-repo.ts';
import type { JourneysCursorKey, JourneysRepo } from './journeys-repo.ts';
import type { LeadRecordsCursorKey, LeadRecordsRepo } from './lead-records-repo.ts';

const CONTACTS_NORMALIZED_PHONE_INDEX = 'normalized_phone-index';
const CONTACTS_NORMALIZED_EMAIL_INDEX = 'normalized_email-index';
const CONTACTS_QUO_CONTACT_ID_INDEX = 'quo_contact_id-index';
const JOURNEYS_ADMIN_UPDATED_AT_INDEX = 'admin_partition-updated_at_ms-index';
const LEAD_RECORDS_ADMIN_UPDATED_AT_INDEX = 'admin_partition-updated_at_ms-index';
const LEAD_RECORDS_CONTACT_ID_UPDATED_AT_INDEX = 'contact_id-updated_at_ms-index';
const LEAD_RECORDS_STATUS_UPDATED_AT_INDEX = 'status-updated_at_ms-index';
const JOURNEY_EVENTS_LEAD_RECORD_OCCURRED_INDEX = 'lead_record_id-occurred_at_ms-index';
const ADMIN_PARTITION_ALL = 'all';

function firstItem<T>(items: T[] | undefined): T | null {
  return items?.[0] ?? null;
}

function removeNullKeys<T extends Record<string, unknown>>(
  item: T,
  keys: Array<keyof T>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...item };
  for (const key of keys) {
    if (next[key as string] === null) {
      delete next[key as string];
    }
  }
  return next;
}

export class DynamoLeadContactsRepo implements LeadContactsRepo {
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async getById(contactId: string): Promise<LeadContact | null> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { contact_id: contactId },
      }),
    );
    return (result.Item as LeadContact | undefined) ?? null;
  }

  async findByNormalizedPhone(normalizedPhone: string): Promise<LeadContact | null> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: CONTACTS_NORMALIZED_PHONE_INDEX,
        KeyConditionExpression: 'normalized_phone = :normalizedPhone',
        ExpressionAttributeValues: {
          ':normalizedPhone': normalizedPhone,
        },
        Limit: 1,
      }),
    );
    return firstItem(result.Items as LeadContact[] | undefined);
  }

  async findByNormalizedEmail(normalizedEmail: string): Promise<LeadContact | null> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: CONTACTS_NORMALIZED_EMAIL_INDEX,
        KeyConditionExpression: 'normalized_email = :normalizedEmail',
        ExpressionAttributeValues: {
          ':normalizedEmail': normalizedEmail,
        },
        Limit: 1,
      }),
    );
    return firstItem(result.Items as LeadContact[] | undefined);
  }

  async findByQuoContactId(quoContactId: string): Promise<LeadContact | null> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: CONTACTS_QUO_CONTACT_ID_INDEX,
        KeyConditionExpression: 'quo_contact_id = :quoContactId',
        ExpressionAttributeValues: {
          ':quoContactId': quoContactId,
        },
        Limit: 1,
      }),
    );
    return firstItem(result.Items as LeadContact[] | undefined);
  }

  async put(contact: LeadContact): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: removeNullKeys(contact, [
          'normalized_phone',
          'normalized_email',
          'quo_contact_id',
        ]),
      }),
    );
  }
}

export class DynamoJourneysRepo implements JourneysRepo {
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async getById(journeyId: string): Promise<Journey | null> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { journey_id: journeyId },
      }),
    );
    return (result.Item as Journey | undefined) ?? null;
  }

  async listPage(args: {
    limit: number;
    cursor?: JourneysCursorKey;
  }): Promise<{ items: Journey[]; lastEvaluatedKey?: JourneysCursorKey }> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: JOURNEYS_ADMIN_UPDATED_AT_INDEX,
        KeyConditionExpression: 'admin_partition = :adminPartition',
        ExpressionAttributeValues: {
          ':adminPartition': ADMIN_PARTITION_ALL,
        },
        ScanIndexForward: false,
        Limit: args.limit,
        ...(args.cursor ? { ExclusiveStartKey: args.cursor } : {}),
      }),
    );

    return {
      items: (result.Items as Journey[] | undefined) ?? [],
      lastEvaluatedKey: result.LastEvaluatedKey as JourneysCursorKey | undefined,
    };
  }

  async put(journey: Journey): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: removeNullKeys(
          {
            ...journey,
            admin_partition: ADMIN_PARTITION_ALL,
          },
          ['lead_record_id', 'contact_id', 'capture_channel'],
        ),
      }),
    );
  }
}

export class DynamoLeadRecordsRepo implements LeadRecordsRepo {
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async getById(leadRecordId: string): Promise<LeadRecord | null> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { lead_record_id: leadRecordId },
      }),
    );
    return (result.Item as LeadRecord | undefined) ?? null;
  }

  async listByContactId(contactId: string): Promise<LeadRecord[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: LEAD_RECORDS_CONTACT_ID_UPDATED_AT_INDEX,
        KeyConditionExpression: 'contact_id = :contactId',
        ExpressionAttributeValues: {
          ':contactId': contactId,
        },
        ScanIndexForward: false,
      }),
    );
    return (result.Items as LeadRecord[] | undefined) ?? [];
  }

  async listByStatus(status: LeadRecordStatus): Promise<LeadRecord[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: LEAD_RECORDS_STATUS_UPDATED_AT_INDEX,
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': status,
        },
        ScanIndexForward: false,
      }),
    );
    return (result.Items as LeadRecord[] | undefined) ?? [];
  }

  async listPage(args: {
    limit: number;
    qualifiedFilter: boolean | null;
    cursor?: LeadRecordsCursorKey;
  }): Promise<{ items: LeadRecord[]; lastEvaluatedKey?: LeadRecordsCursorKey }> {
    const items: LeadRecord[] = [];
    let cursor = args.cursor;

    while (items.length < args.limit) {
      const remaining = args.limit - items.length;
      const result = await this.db.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: LEAD_RECORDS_ADMIN_UPDATED_AT_INDEX,
          KeyConditionExpression: 'admin_partition = :adminPartition',
          ExpressionAttributeValues: {
            ':adminPartition': ADMIN_PARTITION_ALL,
            ...(typeof args.qualifiedFilter === 'boolean'
              ? {
                  ':qualificationPartition': args.qualifiedFilter ? 'qualified' : 'unqualified',
                }
              : {}),
          },
          ...(typeof args.qualifiedFilter === 'boolean'
            ? { FilterExpression: 'qualification_partition = :qualificationPartition' }
            : {}),
          ScanIndexForward: false,
          Limit: remaining,
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      );

      items.push(...((result.Items as LeadRecord[] | undefined) ?? []));
      cursor = result.LastEvaluatedKey as LeadRecordsCursorKey | undefined;
      if (!cursor) break;
    }

    return {
      items,
      lastEvaluatedKey: cursor,
    };
  }

  async put(leadRecord: LeadRecord): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: removeNullKeys(
          {
            ...leadRecord,
            admin_partition: ADMIN_PARTITION_ALL,
            qualification_partition: leadRecord.qualification.qualified
              ? 'qualified'
              : 'unqualified',
          },
          ['contact_id'],
        ),
      }),
    );
  }
}

export class DynamoJourneyEventsRepo implements JourneyEventsRepo {
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async getBySortKey(journeyId: string, eventSortKey: string): Promise<JourneyEvent | null> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          journey_id: journeyId,
          event_sort_key: eventSortKey,
        },
      }),
    );
    return (result.Item as JourneyEvent | undefined) ?? null;
  }

  async append(event: JourneyEvent): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: removeNullKeys(event, ['client_event_id', 'lead_record_id', 'customer_action', 'workflow_outcome', 'capture_channel', 'lead_strength', 'verification_status']),
      }),
    );
  }

  async appendMany(events: JourneyEvent[]): Promise<void> {
    for (const event of events) {
      await this.append(event);
    }
  }

  async listByJourneyId(journeyId: string): Promise<JourneyEvent[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'journey_id = :journeyId',
        ExpressionAttributeValues: {
          ':journeyId': journeyId,
        },
        ScanIndexForward: true,
      }),
    );
    return (result.Items as JourneyEvent[] | undefined) ?? [];
  }

  async listByLeadRecordId(leadRecordId: string): Promise<JourneyEvent[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: JOURNEY_EVENTS_LEAD_RECORD_OCCURRED_INDEX,
        KeyConditionExpression: 'lead_record_id = :leadRecordId',
        ExpressionAttributeValues: {
          ':leadRecordId': leadRecordId,
        },
        ScanIndexForward: true,
      }),
    );
    return (result.Items as JourneyEvent[] | undefined) ?? [];
  }

  async scanPage(args: {
    limit: number;
    cursor?: Record<string, unknown>;
  }): Promise<{ items: JourneyEvent[]; lastEvaluatedKey?: Record<string, unknown> }> {
    const result = await this.db.send(
      new ScanCommand({
        TableName: this.tableName,
        Limit: args.limit,
        ...(args.cursor ? { ExclusiveStartKey: args.cursor } : {}),
      }),
    );

    return {
      items: (result.Items as JourneyEvent[] | undefined) ?? [],
      lastEvaluatedKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
    };
  }
}

export class DynamoLeadActionTokensRepo implements LeadActionTokensRepo {
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async get(token: string) {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { token },
      }),
    );
    return (result.Item as LeadActionToken | undefined) ?? null;
  }

  async put(token: LeadActionToken): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: token,
      }),
    );
  }

  async delete(token: string): Promise<void> {
    await this.db.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { token },
      }),
    );
  }
}

export type LeadCoreRepos = {
  actionTokens: LeadActionTokensRepo;
  contacts: LeadContactsRepo;
  journeys: JourneysRepo;
  journeyEvents: JourneyEventsRepo;
  leadRecords: LeadRecordsRepo;
};

export function createDynamoLeadCoreRepos(args: {
  db: DynamoDBDocumentClient;
  actionTokensTableName: string;
  contactsTableName: string;
  journeysTableName: string;
  journeyEventsTableName: string;
  leadRecordsTableName: string;
}): LeadCoreRepos {
  return {
    actionTokens: new DynamoLeadActionTokensRepo(args.db, args.actionTokensTableName),
    contacts: new DynamoLeadContactsRepo(args.db, args.contactsTableName),
    journeys: new DynamoJourneysRepo(args.db, args.journeysTableName),
    journeyEvents: new DynamoJourneyEventsRepo(args.db, args.journeyEventsTableName),
    leadRecords: new DynamoLeadRecordsRepo(args.db, args.leadRecordsTableName),
  };
}
