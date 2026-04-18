import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { createDynamoLeadCoreRepos, type LeadCoreRepos } from './repos/dynamo.ts';

const leadCoreEnvSchema = z.object({
  LEAD_CONTACTS_TABLE_NAME: z.string().trim().min(1),
  LEAD_JOURNEYS_TABLE_NAME: z.string().trim().min(1),
  LEAD_JOURNEY_EVENTS_TABLE_NAME: z.string().trim().min(1),
  LEAD_RECORDS_TABLE_NAME: z.string().trim().min(1),
});

export type LeadCoreRuntime = {
  configValid: boolean;
  db: DynamoDBDocumentClient | null;
  repos: LeadCoreRepos | null;
};

export function createLeadCoreRuntime(env: Record<string, string | undefined>): LeadCoreRuntime {
  const parsed = leadCoreEnvSchema.safeParse(env);
  if (!parsed.success) {
    return {
      configValid: false,
      db: null,
      repos: null,
    };
  }

  const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const repos = createDynamoLeadCoreRepos({
    db,
    contactsTableName: parsed.data.LEAD_CONTACTS_TABLE_NAME,
    journeysTableName: parsed.data.LEAD_JOURNEYS_TABLE_NAME,
    journeyEventsTableName: parsed.data.LEAD_JOURNEY_EVENTS_TABLE_NAME,
    leadRecordsTableName: parsed.data.LEAD_RECORDS_TABLE_NAME,
  });

  return {
    configValid: true,
    db,
    repos,
  };
}
