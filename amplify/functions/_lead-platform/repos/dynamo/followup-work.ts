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
      scanIndexForward?: boolean;
      updatedAtLte?: number;
    } = {},
  ): Promise<LeadFollowupWorkItem[]> {
    const expressionAttributeNames: Record<string, string> = {
      '#status': 'status',
    };
    const expressionAttributeValues: Record<string, number | string> = {
      ':status': status,
    };
    let keyConditionExpression = '#status = :status';

    if (typeof options.updatedAtLte === 'number') {
      expressionAttributeNames['#updated_at'] = 'updated_at';
      expressionAttributeValues[':updated_at_lte'] = options.updatedAtLte;
      keyConditionExpression = '#status = :status AND #updated_at <= :updated_at_lte';
    }

    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: FOLLOWUP_WORK_STATUS_UPDATED_AT_INDEX,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        Limit: options.limit,
        ScanIndexForward: options.scanIndexForward ?? false,
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

  async updateFailureAlertState(args: {
    alertError?: string | null;
    alertKind: 'error' | 'stale_queued' | 'stale_processing';
    alertMessageId?: string | null;
    alertSentAt?: number;
    alertStatus: 'sent' | 'failed';
    expectedStatus: LeadFollowupWorkStatus;
    expectedUpdatedAt: number;
    idempotencyKey: string;
    lastAttemptAt: number;
  }): Promise<boolean> {
    const expressionAttributeNames: Record<string, string> = {
      '#failure_alert_error': 'failure_alert_error',
      '#failure_alert_kind': 'failure_alert_kind',
      '#failure_alert_last_attempt_at': 'failure_alert_last_attempt_at',
      '#failure_alert_message_id': 'failure_alert_message_id',
      '#failure_alert_sent_at': 'failure_alert_sent_at',
      '#failure_alert_status': 'failure_alert_status',
      '#status': 'status',
      '#updated_at': 'updated_at',
    };
    const expressionAttributeValues: Record<string, number | string> = {
      ':alert_error': (args.alertError ?? '').trim(),
      ':alert_kind': args.alertKind,
      ':alert_message_id': (args.alertMessageId ?? '').trim(),
      ':alert_status': args.alertStatus,
      ':expected_status': args.expectedStatus,
      ':expected_updated_at': args.expectedUpdatedAt,
      ':last_attempt_at': args.lastAttemptAt,
    };
    const setClauses = [
      '#failure_alert_status = :alert_status',
      '#failure_alert_kind = :alert_kind',
      '#failure_alert_last_attempt_at = :last_attempt_at',
      '#failure_alert_message_id = :alert_message_id',
      '#failure_alert_error = :alert_error',
    ];
    const removeClauses: string[] = [];

    if (typeof args.alertSentAt === 'number') {
      expressionAttributeValues[':alert_sent_at'] = args.alertSentAt;
      setClauses.push('#failure_alert_sent_at = :alert_sent_at');
    } else {
      removeClauses.push('#failure_alert_sent_at');
    }

    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { idempotency_key: args.idempotencyKey },
          ConditionExpression:
            'attribute_exists(idempotency_key) AND #status = :expected_status AND #updated_at = :expected_updated_at AND attribute_not_exists(#failure_alert_sent_at)',
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          UpdateExpression: `SET ${setClauses.join(', ')}${
            removeClauses.length ? ` REMOVE ${removeClauses.join(', ')}` : ''
          }`,
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
