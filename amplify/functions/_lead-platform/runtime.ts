import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { createDynamoLeadPlatformRepos, type LeadPlatformRepos } from './repos/dynamo.ts';

const leadPlatformEnvSchema = z.object({
  LEAD_CONTACT_OBSERVATIONS_TABLE_NAME: z.string().trim().min(1),
  LEAD_CONTACT_POINTS_TABLE_NAME: z.string().trim().min(1),
  LEAD_CONTACTS_TABLE_NAME: z.string().trim().min(1),
  LEAD_JOURNEYS_TABLE_NAME: z.string().trim().min(1),
  LEAD_JOURNEY_EVENTS_TABLE_NAME: z.string().trim().min(1),
  LEAD_FOLLOWUP_WORK_TABLE_NAME: z.string().trim().min(1),
  LEAD_RECORDS_TABLE_NAME: z.string().trim().min(1),
  LEAD_PROVIDER_CONTACT_PROJECTIONS_TABLE_NAME: z.string().trim().min(1),
  LEAD_CONVERSION_DECISIONS_TABLE_NAME: z.string().trim().min(1),
  LEAD_CONVERSION_FEEDBACK_OUTBOX_TABLE_NAME: z.string().trim().min(1),
  LEAD_CONVERSION_FEEDBACK_OUTCOMES_TABLE_NAME: z.string().trim().min(1),
  PROVIDER_CONVERSION_DESTINATIONS_TABLE_NAME: z.string().trim().min(1),
});

export type LeadPlatformRuntime = {
  configValid: boolean;
  db: DynamoDBDocumentClient | null;
  repos: LeadPlatformRepos | null;
};

export function createLeadPlatformRuntime(
  env: Record<string, string | undefined>,
): LeadPlatformRuntime {
  const parsed = leadPlatformEnvSchema.safeParse(env);
  if (!parsed.success) {
    return {
      configValid: false,
      db: null,
      repos: null,
    };
  }

  const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const repos = createDynamoLeadPlatformRepos({
    db,
    contactObservationsTableName: parsed.data.LEAD_CONTACT_OBSERVATIONS_TABLE_NAME,
    contactPointsTableName: parsed.data.LEAD_CONTACT_POINTS_TABLE_NAME,
    contactsTableName: parsed.data.LEAD_CONTACTS_TABLE_NAME,
    journeysTableName: parsed.data.LEAD_JOURNEYS_TABLE_NAME,
    journeyEventsTableName: parsed.data.LEAD_JOURNEY_EVENTS_TABLE_NAME,
    followupWorkTableName: parsed.data.LEAD_FOLLOWUP_WORK_TABLE_NAME,
    leadRecordsTableName: parsed.data.LEAD_RECORDS_TABLE_NAME,
    providerContactProjectionsTableName: parsed.data.LEAD_PROVIDER_CONTACT_PROJECTIONS_TABLE_NAME,
    conversionDecisionsTableName: parsed.data.LEAD_CONVERSION_DECISIONS_TABLE_NAME,
    conversionFeedbackOutboxTableName: parsed.data.LEAD_CONVERSION_FEEDBACK_OUTBOX_TABLE_NAME,
    conversionFeedbackOutcomesTableName: parsed.data.LEAD_CONVERSION_FEEDBACK_OUTCOMES_TABLE_NAME,
    providerConversionDestinationsTableName:
      parsed.data.PROVIDER_CONVERSION_DESTINATIONS_TABLE_NAME,
  });

  return {
    configValid: true,
    db,
    repos,
  };
}
