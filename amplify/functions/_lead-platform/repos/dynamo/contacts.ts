import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { LeadContact } from '../../domain/contact.ts';
import type { LeadContactsRepo } from '../contacts-repo.ts';
import { CONTACTS_NORMALIZED_EMAIL_INDEX, CONTACTS_NORMALIZED_PHONE_INDEX } from './constants.ts';
import { firstItem, removeNullKeys } from './helpers.ts';

export class DynamoLeadContactsRepo implements LeadContactsRepo {
  private readonly db: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(db: DynamoDBDocumentClient, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async getById(contactId: string): Promise<LeadContact | null> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { contact_id: contactId },
      }),
    );
    return (result.Item as LeadContact | undefined) ?? null;
  }

  async findByNormalizedPhone(normalizedPhone: string): Promise<LeadContact | null> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: CONTACTS_NORMALIZED_PHONE_INDEX,
        KeyConditionExpression: 'normalized_phone = :normalizedPhone',
        ExpressionAttributeValues: {
          ':normalizedPhone': normalizedPhone,
        },
        Limit: 1,
      }),
    );
    return firstItem(result.Items as LeadContact[] | undefined);
  }

  async findByNormalizedEmail(normalizedEmail: string): Promise<LeadContact | null> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: CONTACTS_NORMALIZED_EMAIL_INDEX,
        KeyConditionExpression: 'normalized_email = :normalizedEmail',
        ExpressionAttributeValues: {
          ':normalizedEmail': normalizedEmail,
        },
        Limit: 1,
      }),
    );
    return firstItem(result.Items as LeadContact[] | undefined);
  }

  async put(contact: LeadContact): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: removeNullKeys(contact, [
          'normalized_phone',
          'normalized_email',
          'primary_phone_contact_point_id',
          'primary_email_contact_point_id',
        ]),
      }),
    );
  }
}
