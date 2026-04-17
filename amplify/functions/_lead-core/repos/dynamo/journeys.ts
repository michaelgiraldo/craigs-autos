import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Journey } from '../../domain/types.ts';
import type { JourneysCursorKey, JourneysRepo } from '../journeys-repo.ts';
import { ADMIN_PARTITION_ALL, JOURNEYS_ADMIN_UPDATED_AT_INDEX } from './constants.ts';
import { removeNullKeys } from './helpers.ts';

export class DynamoJourneysRepo implements JourneysRepo {
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async getById(journeyId: string): Promise<Journey | null> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { journey_id: journeyId },
      }),
    );
    return (result.Item as Journey | undefined) ?? null;
  }

  async listPage(args: {
    limit: number;
    cursor?: JourneysCursorKey;
  }): Promise<{ items: Journey[]; lastEvaluatedKey?: JourneysCursorKey }> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: JOURNEYS_ADMIN_UPDATED_AT_INDEX,
        KeyConditionExpression: 'admin_partition = :adminPartition',
        ExpressionAttributeValues: {
          ':adminPartition': ADMIN_PARTITION_ALL,
        },
        ScanIndexForward: false,
        Limit: args.limit,
        ...(args.cursor ? { ExclusiveStartKey: args.cursor } : {}),
      }),
    );

    return {
      items: (result.Items as Journey[] | undefined) ?? [],
      lastEvaluatedKey: result.LastEvaluatedKey as JourneysCursorKey | undefined,
    };
  }

  async put(journey: Journey): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: removeNullKeys(
          {
            ...journey,
            admin_partition: ADMIN_PARTITION_ALL,
          },
          ['lead_record_id', 'contact_id', 'capture_channel'],
        ),
      }),
    );
  }
}
