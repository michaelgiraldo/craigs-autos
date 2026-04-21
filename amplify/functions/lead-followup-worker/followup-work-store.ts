import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import { stripUndefinedValues } from '../_lead-platform/repos/dynamo/helpers.ts';
import type { LeadFollowupWorkerDeps } from './types.ts';

export type LeadFollowupWorkStore = Pick<
  LeadFollowupWorkerDeps,
  'acquireLease' | 'getFollowupWork' | 'saveFollowupWork'
>;

export function createDynamoLeadFollowupWorkStore(args: {
  db: DynamoDBDocumentClient | null;
  tableName: string;
}): LeadFollowupWorkStore {
  return {
    getFollowupWork: async (followupWorkId: string) => {
      if (!args.db || !args.tableName) return null;
      const result = await args.db.send(
        new GetCommand({
          TableName: args.tableName,
          Key: { followup_work_id: followupWorkId },
        }),
      );
      return (result.Item as LeadFollowupWorkItem | undefined) ?? null;
    },
    acquireLease: async ({ followupWorkId, leaseId, nowEpoch, leaseExpiresAt }) => {
      if (!args.db || !args.tableName) return false;
      try {
        await args.db.send(
          new UpdateCommand({
            TableName: args.tableName,
            Key: { followup_work_id: followupWorkId },
            UpdateExpression:
              'SET #status = :processing, lease_id = :leaseId, lock_expires_at = :lockExpiresAt, updated_at = :updatedAt',
            ConditionExpression:
              'attribute_exists(followup_work_id) AND (attribute_not_exists(lock_expires_at) OR lock_expires_at < :nowEpoch OR #status IN (:queued, :error))',
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
    saveFollowupWork: async (record: LeadFollowupWorkItem) => {
      if (!args.db || !args.tableName) return;
      await args.db.send(
        new PutCommand({
          TableName: args.tableName,
          Item: stripUndefinedValues(record),
        }),
      );
    },
  };
}
