import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoLeadConversionDecisionsRepo } from './dynamo/conversion-decisions.ts';
import { DynamoLeadConversionFeedbackOutboxRepo } from './dynamo/conversion-feedback-outbox.ts';
import { DynamoLeadConversionFeedbackOutcomesRepo } from './dynamo/conversion-feedback-outcomes.ts';
import { DynamoLeadContactsRepo } from './dynamo/contacts.ts';
import { DynamoJourneyEventsRepo } from './dynamo/events.ts';
import { DynamoJourneysRepo } from './dynamo/journeys.ts';
import { DynamoLeadRecordsRepo } from './dynamo/lead-records.ts';
import { DynamoProviderConversionDestinationsRepo } from './dynamo/provider-conversion-destinations.ts';
import type { LeadConversionDecisionsRepo } from './conversion-decisions-repo.ts';
import type { LeadConversionFeedbackOutboxRepo } from './conversion-feedback-outbox-repo.ts';
import type { LeadConversionFeedbackOutcomesRepo } from './conversion-feedback-outcomes-repo.ts';
import type { LeadContactsRepo } from './contacts-repo.ts';
import type { JourneyEventsRepo } from './events-repo.ts';
import type { JourneysRepo } from './journeys-repo.ts';
import type { LeadRecordsRepo } from './lead-records-repo.ts';
import type { ProviderConversionDestinationsRepo } from './provider-conversion-destinations-repo.ts';

export {
  DynamoLeadContactsRepo,
  DynamoLeadConversionDecisionsRepo,
  DynamoLeadConversionFeedbackOutboxRepo,
  DynamoLeadConversionFeedbackOutcomesRepo,
  DynamoJourneyEventsRepo,
  DynamoJourneysRepo,
  DynamoLeadRecordsRepo,
  DynamoProviderConversionDestinationsRepo,
};

export type LeadPlatformRepos = {
  contacts: LeadContactsRepo;
  journeys: JourneysRepo;
  journeyEvents: JourneyEventsRepo;
  leadRecords: LeadRecordsRepo;
  conversionDecisions: LeadConversionDecisionsRepo;
  conversionFeedbackOutbox: LeadConversionFeedbackOutboxRepo;
  conversionFeedbackOutcomes: LeadConversionFeedbackOutcomesRepo;
  providerConversionDestinations: ProviderConversionDestinationsRepo;
};

export function createDynamoLeadPlatformRepos(args: {
  db: DynamoDBDocumentClient;
  contactsTableName: string;
  journeysTableName: string;
  journeyEventsTableName: string;
  leadRecordsTableName: string;
  conversionDecisionsTableName: string;
  conversionFeedbackOutboxTableName: string;
  conversionFeedbackOutcomesTableName: string;
  providerConversionDestinationsTableName: string;
}): LeadPlatformRepos {
  return {
    contacts: new DynamoLeadContactsRepo(args.db, args.contactsTableName),
    journeys: new DynamoJourneysRepo(args.db, args.journeysTableName),
    journeyEvents: new DynamoJourneyEventsRepo(args.db, args.journeyEventsTableName),
    leadRecords: new DynamoLeadRecordsRepo(args.db, args.leadRecordsTableName),
    conversionDecisions: new DynamoLeadConversionDecisionsRepo(
      args.db,
      args.conversionDecisionsTableName,
    ),
    conversionFeedbackOutbox: new DynamoLeadConversionFeedbackOutboxRepo(
      args.db,
      args.conversionFeedbackOutboxTableName,
    ),
    conversionFeedbackOutcomes: new DynamoLeadConversionFeedbackOutcomesRepo(
      args.db,
      args.conversionFeedbackOutcomesTableName,
    ),
    providerConversionDestinations: new DynamoProviderConversionDestinationsRepo(
      args.db,
      args.providerConversionDestinationsTableName,
    ),
  };
}
