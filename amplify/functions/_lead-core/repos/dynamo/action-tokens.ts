import {
  DeleteCommand,
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import type { LeadActionToken } from '../../domain/types.ts';
import type { LeadActionTokensRepo } from '../action-tokens-repo.ts';

export class DynamoLeadActionTokensRepo implements LeadActionTokensRepo {
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async get(token: string) {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { token },
      }),
    );
    return (result.Item as LeadActionToken | undefined) ?? null;
  }

  async put(token: LeadActionToken): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: token,
      }),
    );
  }

  async delete(token: string): Promise<void> {
    await this.db.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { token },
      }),
    );
  }
}
