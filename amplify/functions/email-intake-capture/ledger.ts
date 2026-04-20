import { PutCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { EmailIntakeLedger } from './types.ts';

function isConditionalFailure(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

export function createDynamoEmailIntakeLedger(args: {
  db: DynamoDBDocumentClient | null;
  tableName: string;
}): EmailIntakeLedger {
  return {
    reserve: async ({ item, key, ttl }) => {
      if (!args.db || !args.tableName) return false;
      try {
        await args.db.send(
          new PutCommand({
            TableName: args.tableName,
            Item: {
              ...item,
              email_intake_key: key,
              status: 'processing',
              ttl,
            },
            ConditionExpression: 'attribute_not_exists(email_intake_key) OR #status = :error',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':error': 'error',
            },
          }),
        );
        return true;
      } catch (error: unknown) {
        if (isConditionalFailure(error)) return false;
        throw error;
      }
    },
    markStatus: async ({ key, reason, status }) => {
      if (!args.db || !args.tableName) return;
      await args.db.send(
        new UpdateCommand({
          TableName: args.tableName,
          Key: { email_intake_key: key },
          UpdateExpression: 'SET #status = :status, reason = :reason, updated_at = :updatedAt',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':reason': reason ?? '',
            ':status': status,
            ':updatedAt': Math.floor(Date.now() / 1000),
          },
        }),
      );
    },
  };
}
