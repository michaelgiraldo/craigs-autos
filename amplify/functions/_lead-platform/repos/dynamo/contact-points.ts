import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { LeadContactPoint } from '../../domain/contact-point.ts';
import type { LeadContactPointsRepo } from '../contact-points-repo.ts';
import {
  CONTACT_POINTS_CONTACT_ID_INDEX,
  CONTACT_POINTS_NORMALIZED_VALUE_INDEX,
} from './constants.ts';
import { firstItem } from './helpers.ts';

export class DynamoLeadContactPointsRepo implements LeadContactPointsRepo {
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async getById(contactPointId: string): Promise<LeadContactPoint | null> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { contact_point_id: contactPointId },
      }),
    );
    return (result.Item as LeadContactPoint | undefined) ?? null;
  }

  async findByNormalizedValue(normalizedValue: string): Promise<LeadContactPoint | null> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: CONTACT_POINTS_NORMALIZED_VALUE_INDEX,
        KeyConditionExpression: 'normalized_value = :normalizedValue',
        ExpressionAttributeValues: {
          ':normalizedValue': normalizedValue,
        },
        Limit: 1,
      }),
    );
    return firstItem(result.Items as LeadContactPoint[] | undefined);
  }

  async listByContactId(contactId: string): Promise<LeadContactPoint[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: CONTACT_POINTS_CONTACT_ID_INDEX,
        KeyConditionExpression: 'contact_id = :contactId',
        ExpressionAttributeValues: {
          ':contactId': contactId,
        },
      }),
    );
    return (result.Items as LeadContactPoint[] | undefined) ?? [];
  }

  async put(contactPoint: LeadContactPoint): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: contactPoint,
      }),
    );
  }
}
