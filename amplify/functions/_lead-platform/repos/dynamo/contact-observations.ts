import { type DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { LeadContactObservation } from '../../domain/contact-observation.ts';
import type { LeadContactObservationsRepo } from '../contact-observations-repo.ts';

export class DynamoLeadContactObservationsRepo implements LeadContactObservationsRepo {
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async append(observation: LeadContactObservation): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: observation,
      }),
    );
  }

  async appendMany(observations: LeadContactObservation[]): Promise<void> {
    await Promise.all(observations.map((observation) => this.append(observation)));
  }

  async listByContactId(contactId: string): Promise<LeadContactObservation[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'contact_id = :contactId',
        ExpressionAttributeValues: {
          ':contactId': contactId,
        },
      }),
    );
    return (result.Items as LeadContactObservation[] | undefined) ?? [];
  }
}
