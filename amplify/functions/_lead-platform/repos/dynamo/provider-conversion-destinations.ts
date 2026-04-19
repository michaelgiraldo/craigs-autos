import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { ManagedConversionDestinationKey } from '@craigs/contracts/managed-conversion-contract';
import type { ProviderConversionDestination } from '../../domain/conversion-feedback.ts';
import type { ProviderConversionDestinationsRepo } from '../provider-conversion-destinations-repo.ts';
import { PROVIDER_DESTINATIONS_ENABLED_UPDATED_INDEX } from './constants.ts';

const ENABLED_PARTITION = 'enabled';

export class DynamoProviderConversionDestinationsRepo
  implements ProviderConversionDestinationsRepo
{
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async getByKey(
    destinationKey: ManagedConversionDestinationKey,
  ): Promise<ProviderConversionDestination | null> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { destination_key: destinationKey },
      }),
    );
    return (result.Item as ProviderConversionDestination | undefined) ?? null;
  }

  async listEnabled(): Promise<ProviderConversionDestination[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: PROVIDER_DESTINATIONS_ENABLED_UPDATED_INDEX,
        KeyConditionExpression: 'enabled_partition = :enabledPartition',
        ExpressionAttributeValues: {
          ':enabledPartition': ENABLED_PARTITION,
        },
        ScanIndexForward: false,
      }),
    );
    return (result.Items as ProviderConversionDestination[] | undefined) ?? [];
  }

  async put(destination: ProviderConversionDestination): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          ...destination,
          ...(destination.enabled ? { enabled_partition: ENABLED_PARTITION } : {}),
        },
      }),
    );
  }
}
