import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
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

  async getById(outboxId: string): Promise<LeadConversionFeedbackOutboxItem | null> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { outbox_id: outboxId },
      }),
    );
    return (result.Item as LeadConversionFeedbackOutboxItem | undefined) ?? null;
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
    return (result.Items as LeadConversionFeedbackOutboxItem[] | undefined) ?? [];
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
    return (result.Items as LeadConversionFeedbackOutboxItem[] | undefined) ?? [];
  }

  async listByStatus(
    status: ManagedConversionFeedbackStatus,
  ): Promise<LeadConversionFeedbackOutboxItem[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: CONVERSION_FEEDBACK_OUTBOX_STATUS_NEXT_ATTEMPT_INDEX,
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': status,
        },
        ScanIndexForward: true,
      }),
    );
    return (result.Items as LeadConversionFeedbackOutboxItem[] | undefined) ?? [];
  }

  async put(item: LeadConversionFeedbackOutboxItem): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: removeNullKeys(item, ['next_attempt_at_ms']),
      }),
    );
  }
}
