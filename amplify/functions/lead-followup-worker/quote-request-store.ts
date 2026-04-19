import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { QuoteRequestRecord } from '../_lead-platform/domain/quote-request.ts';
import type { LeadFollowupWorkerDeps } from './types.ts';

export type QuoteRequestStore = Pick<
  LeadFollowupWorkerDeps,
  'acquireLease' | 'getQuoteRequest' | 'saveQuoteRequest'
>;

export function createDynamoQuoteRequestStore(args: {
  db: DynamoDBDocumentClient | null;
  tableName: string;
}): QuoteRequestStore {
  return {
    getQuoteRequest: async (quoteRequestId: string) => {
      if (!args.db || !args.tableName) return null;
      const result = await args.db.send(
        new GetCommand({
          TableName: args.tableName,
          Key: { quote_request_id: quoteRequestId },
        }),
      );
      return (result.Item as QuoteRequestRecord | undefined) ?? null;
    },
    acquireLease: async ({ quoteRequestId, leaseId, nowEpoch, leaseExpiresAt }) => {
      if (!args.db || !args.tableName) return false;
      try {
        await args.db.send(
          new UpdateCommand({
            TableName: args.tableName,
            Key: { quote_request_id: quoteRequestId },
            UpdateExpression:
              'SET #status = :processing, lease_id = :leaseId, lock_expires_at = :lockExpiresAt, updated_at = :updatedAt',
            ConditionExpression:
              'attribute_not_exists(lock_expires_at) OR lock_expires_at < :nowEpoch OR #status IN (:queued, :error)',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':processing': 'processing',
              ':leaseId': leaseId,
              ':lockExpiresAt': leaseExpiresAt,
              ':updatedAt': nowEpoch,
              ':nowEpoch': nowEpoch,
              ':queued': 'queued',
              ':error': 'error',
            },
          }),
        );
        return true;
      } catch (error: unknown) {
        if ((error as { name?: string } | null)?.name === 'ConditionalCheckFailedException') {
          return false;
        }
        throw error;
      }
    },
    saveQuoteRequest: async (record: QuoteRequestRecord) => {
      if (!args.db || !args.tableName) return;
      await args.db.send(
        new PutCommand({
          TableName: args.tableName,
          Item: record,
        }),
      );
    },
  };
}
