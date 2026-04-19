import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type { JourneyEvent } from '../../domain/journey-event.ts';
import type { JourneyEventsRepo } from '../events-repo.ts';
import { JOURNEY_EVENTS_LEAD_RECORD_OCCURRED_INDEX } from './constants.ts';
import { removeNullKeys } from './helpers.ts';

function byTimelineOrder(a: JourneyEvent, b: JourneyEvent): number {
  return (
    a.occurred_at_ms - b.occurred_at_ms ||
    a.recorded_at_ms - b.recorded_at_ms ||
    a.event_sort_key.localeCompare(b.event_sort_key)
  );
}

export class DynamoJourneyEventsRepo implements JourneyEventsRepo {
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async getBySortKey(journeyId: string, eventSortKey: string): Promise<JourneyEvent | null> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          journey_id: journeyId,
          event_sort_key: eventSortKey,
        },
      }),
    );
    return (result.Item as JourneyEvent | undefined) ?? null;
  }

  async append(event: JourneyEvent): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: removeNullKeys(event, [
          'client_event_id',
          'lead_record_id',
          'customer_action',
          'workflow_outcome',
          'capture_channel',
          'lead_strength',
          'verification_status',
        ]),
      }),
    );
  }

  async appendMany(events: JourneyEvent[]): Promise<void> {
    for (const event of events) {
      await this.append(event);
    }
  }

  async listByJourneyId(journeyId: string): Promise<JourneyEvent[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'journey_id = :journeyId',
        ExpressionAttributeValues: {
          ':journeyId': journeyId,
        },
        ScanIndexForward: true,
      }),
    );
    return ((result.Items as JourneyEvent[] | undefined) ?? []).sort(byTimelineOrder);
  }

  async listByLeadRecordId(leadRecordId: string): Promise<JourneyEvent[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: JOURNEY_EVENTS_LEAD_RECORD_OCCURRED_INDEX,
        KeyConditionExpression: 'lead_record_id = :leadRecordId',
        ExpressionAttributeValues: {
          ':leadRecordId': leadRecordId,
        },
        ScanIndexForward: true,
      }),
    );
    return (result.Items as JourneyEvent[] | undefined) ?? [];
  }

  async scanPage(args: {
    limit: number;
    cursor?: Record<string, unknown>;
  }): Promise<{ items: JourneyEvent[]; lastEvaluatedKey?: Record<string, unknown> }> {
    const result = await this.db.send(
      new ScanCommand({
        TableName: this.tableName,
        Limit: args.limit,
        ...(args.cursor ? { ExclusiveStartKey: args.cursor } : {}),
      }),
    );

    return {
      items: (result.Items as JourneyEvent[] | undefined) ?? [],
      lastEvaluatedKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
    };
  }
}
