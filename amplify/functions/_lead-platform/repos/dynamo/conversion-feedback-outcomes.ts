import { type DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { LeadConversionFeedbackOutcome } from '../../domain/conversion-feedback.ts';
import type { LeadConversionFeedbackOutcomesRepo } from '../conversion-feedback-outcomes-repo.ts';
import { CONVERSION_FEEDBACK_OUTCOMES_LEAD_RECORD_OCCURRED_INDEX } from './constants.ts';

export class DynamoLeadConversionFeedbackOutcomesRepo
  implements LeadConversionFeedbackOutcomesRepo
{
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async append(outcome: LeadConversionFeedbackOutcome): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: outcome,
      }),
    );
  }

  async listByLeadRecordId(leadRecordId: string): Promise<LeadConversionFeedbackOutcome[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: CONVERSION_FEEDBACK_OUTCOMES_LEAD_RECORD_OCCURRED_INDEX,
        KeyConditionExpression: 'lead_record_id = :leadRecordId',
        ExpressionAttributeValues: {
          ':leadRecordId': leadRecordId,
        },
        ScanIndexForward: false,
      }),
    );
    return (result.Items as LeadConversionFeedbackOutcome[] | undefined) ?? [];
  }

  async listByOutboxId(outboxId: string): Promise<LeadConversionFeedbackOutcome[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'outbox_id = :outboxId',
        ExpressionAttributeValues: {
          ':outboxId': outboxId,
        },
        ScanIndexForward: false,
      }),
    );
    return (result.Items as LeadConversionFeedbackOutcome[] | undefined) ?? [];
  }
}
