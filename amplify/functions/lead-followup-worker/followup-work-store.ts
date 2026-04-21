import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import { stripUndefinedValues } from '../_lead-platform/repos/dynamo/helpers.ts';
import type { LeadFollowupWorkerDeps, LeasedLeadFollowupWorkItem } from './types.ts';

export type LeadFollowupWorkStore = Pick<
  LeadFollowupWorkerDeps,
  'acquireLease' | 'getFollowupWork' | 'saveFollowupWork'
>;

export class StaleFollowupWorkLeaseError extends Error {
  constructor(message = 'stale_followup_work_lease') {
    super(message);
    this.name = 'StaleFollowupWorkLeaseError';
  }
}

function isConditionalCheckFailed(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'ConditionalCheckFailedException';
}

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
        if (isConditionalCheckFailed(error)) {
          return false;
        }
        throw error;
      }
    },
    saveFollowupWork: async (record: LeasedLeadFollowupWorkItem) => {
      if (!args.db || !args.tableName) return;
      if (!record.lease_id) {
        throw new StaleFollowupWorkLeaseError('Cannot save follow-up work without an active lease.');
      }
      try {
        await args.db.send(
          new PutCommand({
            TableName: args.tableName,
            Item: stripUndefinedValues(record),
            ConditionExpression: '#lease_id = :lease_id',
            ExpressionAttributeNames: {
              '#lease_id': 'lease_id',
            },
            ExpressionAttributeValues: {
              ':lease_id': record.lease_id,
            },
          }),
        );
      } catch (error: unknown) {
        if (isConditionalCheckFailed(error)) {
          throw new StaleFollowupWorkLeaseError();
        }
        throw error;
      }
    },
  };
}
