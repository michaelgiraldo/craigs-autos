import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { ManagedConversionFeedbackStatus } from '@craigs/contracts/managed-conversion-contract';
import type { LeadConversionFeedbackOutboxItem } from '../../domain/conversion-feedback.ts';
import type { LeadConversionFeedbackOutboxRepo } from '../conversion-feedback-outbox-repo.ts';
import {
  CONVERSION_FEEDBACK_OUTBOX_DECISION_UPDATED_INDEX,
  CONVERSION_FEEDBACK_OUTBOX_LEAD_RECORD_UPDATED_INDEX,
  CONVERSION_FEEDBACK_OUTBOX_STATUS_NEXT_ATTEMPT_INDEX,
} from './constants.ts';
import { removeNullKeys } from './helpers.ts';

export class DynamoLeadConversionFeedbackOutboxRepo implements LeadConversionFeedbackOutboxRepo {
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  private normalizeItem(
    item: LeadConversionFeedbackOutboxItem | undefined,
  ): LeadConversionFeedbackOutboxItem | null {
    if (!item) return null;
    return {
      ...item,
      lease_owner: item.lease_owner ?? null,
      lease_expires_at_ms: item.lease_expires_at_ms ?? null,
      next_attempt_at_ms: item.next_attempt_at_ms ?? null,
      last_outcome_at_ms: item.last_outcome_at_ms ?? null,
    };
  }

  async getById(outboxId: string): Promise<LeadConversionFeedbackOutboxItem | null> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { outbox_id: outboxId },
      }),
    );
    return this.normalizeItem(result.Item as LeadConversionFeedbackOutboxItem | undefined);
  }

  async acquireLease(args: {
    outboxId: string;
    expectedStatus: ManagedConversionFeedbackStatus;
    leaseOwner: string;
    leaseExpiresAtMs: number;
    nowMs: number;
    statusReason: string;
  }): Promise<LeadConversionFeedbackOutboxItem | null> {
    try {
      const result = await this.db.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { outbox_id: args.outboxId },
          ConditionExpression:
            '#status = :expectedStatus AND (attribute_not_exists(lease_expires_at_ms) OR lease_expires_at_ms <= :nowMs)',
          UpdateExpression:
            'SET lease_owner = :leaseOwner, lease_expires_at_ms = :leaseExpiresAtMs, attempt_count = if_not_exists(attempt_count, :zero) + :one, status_reason = :statusReason, updated_at_ms = :nowMs',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':expectedStatus': args.expectedStatus,
            ':leaseOwner': args.leaseOwner,
            ':leaseExpiresAtMs': args.leaseExpiresAtMs,
            ':nowMs': args.nowMs,
            ':zero': 0,
            ':one': 1,
            ':statusReason': args.statusReason,
          },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return this.normalizeItem(result.Attributes as LeadConversionFeedbackOutboxItem | undefined);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  async listByDecisionId(decisionId: string): Promise<LeadConversionFeedbackOutboxItem[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: CONVERSION_FEEDBACK_OUTBOX_DECISION_UPDATED_INDEX,
        KeyConditionExpression: 'decision_id = :decisionId',
        ExpressionAttributeValues: {
          ':decisionId': decisionId,
        },
        ScanIndexForward: false,
      }),
    );
    return ((result.Items as LeadConversionFeedbackOutboxItem[] | undefined) ?? []).map(
      (item) => this.normalizeItem(item) as LeadConversionFeedbackOutboxItem,
    );
  }

  async listByLeadRecordId(leadRecordId: string): Promise<LeadConversionFeedbackOutboxItem[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: CONVERSION_FEEDBACK_OUTBOX_LEAD_RECORD_UPDATED_INDEX,
        KeyConditionExpression: 'lead_record_id = :leadRecordId',
        ExpressionAttributeValues: {
          ':leadRecordId': leadRecordId,
        },
        ScanIndexForward: false,
      }),
    );
    return ((result.Items as LeadConversionFeedbackOutboxItem[] | undefined) ?? []).map(
      (item) => this.normalizeItem(item) as LeadConversionFeedbackOutboxItem,
    );
  }

  async listByStatus(
    status: ManagedConversionFeedbackStatus,
    options: {
      dueAtMs?: number;
      limit?: number;
    } = {},
  ): Promise<LeadConversionFeedbackOutboxItem[]> {
    const dueAtMs = typeof options.dueAtMs === 'number' ? options.dueAtMs : null;
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: CONVERSION_FEEDBACK_OUTBOX_STATUS_NEXT_ATTEMPT_INDEX,
        KeyConditionExpression:
          dueAtMs === null
            ? '#status = :status'
            : '#status = :status AND next_attempt_at_ms <= :dueAtMs',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': status,
          ...(dueAtMs === null ? {} : { ':dueAtMs': dueAtMs }),
        },
        Limit: options.limit,
        ScanIndexForward: true,
      }),
    );
    return ((result.Items as LeadConversionFeedbackOutboxItem[] | undefined) ?? []).map(
      (item) => this.normalizeItem(item) as LeadConversionFeedbackOutboxItem,
    );
  }

  async put(item: LeadConversionFeedbackOutboxItem): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: removeNullKeys(item, [
          'lease_owner',
          'lease_expires_at_ms',
          'next_attempt_at_ms',
          'last_outcome_at_ms',
        ]),
      }),
    );
  }
}
