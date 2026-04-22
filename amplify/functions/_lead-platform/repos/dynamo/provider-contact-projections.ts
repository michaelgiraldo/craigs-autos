import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { ProviderContactProjection } from '../../domain/provider-contact-projection.ts';
import type { ProviderContactProjectionsRepo } from '../provider-contact-projections-repo.ts';
import {
  PROVIDER_CONTACT_PROJECTIONS_CONTACT_ID_INDEX,
  PROVIDER_CONTACT_PROJECTIONS_PROVIDER_EXTERNAL_ID_INDEX,
} from './constants.ts';
import { firstItem } from './helpers.ts';

export class DynamoProviderContactProjectionsRepo implements ProviderContactProjectionsRepo {
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async getById(projectionId: string): Promise<ProviderContactProjection | null> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { projection_id: projectionId },
      }),
    );
    return (result.Item as ProviderContactProjection | undefined) ?? null;
  }

  async findByProviderExternalId(
    providerExternalId: string,
  ): Promise<ProviderContactProjection | null> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: PROVIDER_CONTACT_PROJECTIONS_PROVIDER_EXTERNAL_ID_INDEX,
        KeyConditionExpression: 'provider_external_id = :providerExternalId',
        ExpressionAttributeValues: {
          ':providerExternalId': providerExternalId,
        },
        Limit: 1,
      }),
    );
    return firstItem(result.Items as ProviderContactProjection[] | undefined);
  }

  async listByContactId(contactId: string): Promise<ProviderContactProjection[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: PROVIDER_CONTACT_PROJECTIONS_CONTACT_ID_INDEX,
        KeyConditionExpression: 'contact_id = :contactId',
        ExpressionAttributeValues: {
          ':contactId': contactId,
        },
      }),
    );
    return (result.Items as ProviderContactProjection[] | undefined) ?? [];
  }

  async put(projection: ProviderContactProjection): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: projection,
      }),
    );
  }
}
