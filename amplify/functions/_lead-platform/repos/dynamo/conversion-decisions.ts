import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { LeadConversionDecision } from '../../domain/conversion-feedback.ts';
import type { LeadConversionDecisionsRepo } from '../conversion-decisions-repo.ts';
import { CONVERSION_DECISIONS_LEAD_RECORD_OCCURRED_INDEX } from './constants.ts';

export class DynamoLeadConversionDecisionsRepo implements LeadConversionDecisionsRepo {
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async getById(decisionId: string): Promise<LeadConversionDecision | null> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { decision_id: decisionId },
      }),
    );
    return (result.Item as LeadConversionDecision | undefined) ?? null;
  }

  async listByLeadRecordId(leadRecordId: string): Promise<LeadConversionDecision[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: CONVERSION_DECISIONS_LEAD_RECORD_OCCURRED_INDEX,
        KeyConditionExpression: 'lead_record_id = :leadRecordId',
        ExpressionAttributeValues: {
          ':leadRecordId': leadRecordId,
        },
        ScanIndexForward: false,
      }),
    );
    return (result.Items as LeadConversionDecision[] | undefined) ?? [];
  }

  async put(decision: LeadConversionDecision): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: decision,
      }),
    );
  }
}
