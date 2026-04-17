import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { LeadRecord, LeadRecordStatus } from '../../domain/types.ts';
import type { LeadRecordsCursorKey, LeadRecordsRepo } from '../lead-records-repo.ts';
import {
  ADMIN_PARTITION_ALL,
  LEAD_RECORDS_ADMIN_UPDATED_AT_INDEX,
  LEAD_RECORDS_CONTACT_ID_UPDATED_AT_INDEX,
  LEAD_RECORDS_STATUS_UPDATED_AT_INDEX,
} from './constants.ts';
import { removeNullKeys } from './helpers.ts';

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
