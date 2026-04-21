import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type {
  LeadFollowupWorkItem,
  LeadFollowupWorkStatus,
} from '../../domain/lead-followup-work.ts';
import type { LeadFollowupWorkRepo } from '../followup-work-repo.ts';
import { stripUndefinedValues } from './helpers.ts';

const FOLLOWUP_WORK_STATUS_UPDATED_AT_INDEX = 'status-updated_at-index';

export class DynamoLeadFollowupWorkRepo implements LeadFollowupWorkRepo {
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<LeadFollowupWorkItem | null> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { idempotency_key: idempotencyKey },
      }),
    );
    return (result.Item as LeadFollowupWorkItem | undefined) ?? null;
  }

  async listByStatus(
    status: LeadFollowupWorkStatus,
    options: {
      limit?: number;
    } = {},
  ): Promise<LeadFollowupWorkItem[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: FOLLOWUP_WORK_STATUS_UPDATED_AT_INDEX,
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': status,
        },
        Limit: options.limit,
        ScanIndexForward: false,
      }),
    );
    return (result.Items as LeadFollowupWorkItem[] | undefined) ?? [];
  }

  async acquireLease(args: {
    idempotencyKey: string;
    leaseId: string;
    nowEpoch: number;
    leaseExpiresAt: number;
  }): Promise<boolean> {
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { idempotency_key: args.idempotencyKey },
          UpdateExpression:
            'SET #status = :processing, #lease_id = :lease_id, #lock_expires_at = :lock_expires_at, #updated_at = :now',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#lease_id': 'lease_id',
            '#lock_expires_at': 'lock_expires_at',
            '#updated_at': 'updated_at',
          },
          ExpressionAttributeValues: {
            ':processing': 'processing',
            ':completed': 'completed',
            ':lease_id': args.leaseId,
            ':lock_expires_at': args.leaseExpiresAt,
            ':now': args.nowEpoch,
          },
          ConditionExpression:
            'attribute_exists(idempotency_key) AND #status <> :completed AND (attribute_not_exists(#lock_expires_at) OR #lock_expires_at < :now)',
        }),
      );
      return true;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        return false;
      }
      throw error;
    }
  }

  async put(item: LeadFollowupWorkItem): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: stripUndefinedValues(item),
      }),
    );
  }

  async putIfAbsent(item: LeadFollowupWorkItem): Promise<boolean> {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.tableName,
          Item: stripUndefinedValues(item),
          ConditionExpression: 'attribute_not_exists(idempotency_key)',
        }),
      );
      return true;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        return false;
      }
      throw error;
    }
  }
}
