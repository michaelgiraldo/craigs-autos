import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { QuoteSubmissionRecord } from '../_lead-core/domain/quote-request.ts';
import type { QuoteFollowupDeps } from './types.ts';

export type QuoteSubmissionStore = Pick<
  QuoteFollowupDeps,
  'acquireLease' | 'getSubmission' | 'saveSubmission'
>;

export function createDynamoQuoteSubmissionStore(args: {
  db: DynamoDBDocumentClient | null;
  tableName: string;
}): QuoteSubmissionStore {
  return {
    getSubmission: async (submissionId: string) => {
      if (!args.db || !args.tableName) return null;
      const result = await args.db.send(
        new GetCommand({
          TableName: args.tableName,
          Key: { submission_id: submissionId },
        }),
      );
      return (result.Item as QuoteSubmissionRecord | undefined) ?? null;
    },
    acquireLease: async ({ submissionId, leaseId, nowEpoch, leaseExpiresAt }) => {
      if (!args.db || !args.tableName) return false;
      try {
        await args.db.send(
          new UpdateCommand({
            TableName: args.tableName,
            Key: { submission_id: submissionId },
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
    saveSubmission: async (record: QuoteSubmissionRecord) => {
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
