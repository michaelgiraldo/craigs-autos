import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoLeadContactObservationsRepo } from './dynamo/contact-observations.ts';
import { DynamoLeadContactPointsRepo } from './dynamo/contact-points.ts';
import { DynamoLeadConversionDecisionsRepo } from './dynamo/conversion-decisions.ts';
import { DynamoLeadConversionFeedbackOutboxRepo } from './dynamo/conversion-feedback-outbox.ts';
import { DynamoLeadConversionFeedbackOutcomesRepo } from './dynamo/conversion-feedback-outcomes.ts';
import { DynamoLeadContactsRepo } from './dynamo/contacts.ts';
import { DynamoJourneyEventsRepo } from './dynamo/events.ts';
import { DynamoLeadFollowupWorkRepo } from './dynamo/followup-work.ts';
import { DynamoJourneysRepo } from './dynamo/journeys.ts';
import { DynamoLeadRecordsRepo } from './dynamo/lead-records.ts';
import { DynamoProviderContactProjectionsRepo } from './dynamo/provider-contact-projections.ts';
import { DynamoProviderConversionDestinationsRepo } from './dynamo/provider-conversion-destinations.ts';
import type { LeadContactObservationsRepo } from './contact-observations-repo.ts';
import type { LeadContactPointsRepo } from './contact-points-repo.ts';
import type { LeadConversionDecisionsRepo } from './conversion-decisions-repo.ts';
import type { LeadConversionFeedbackOutboxRepo } from './conversion-feedback-outbox-repo.ts';
import type { LeadConversionFeedbackOutcomesRepo } from './conversion-feedback-outcomes-repo.ts';
import type { LeadContactsRepo } from './contacts-repo.ts';
import type { JourneyEventsRepo } from './events-repo.ts';
import type { LeadFollowupWorkRepo } from './followup-work-repo.ts';
import type { JourneysRepo } from './journeys-repo.ts';
import type { LeadRecordsRepo } from './lead-records-repo.ts';
import type { ProviderContactProjectionsRepo } from './provider-contact-projections-repo.ts';
import type { ProviderConversionDestinationsRepo } from './provider-conversion-destinations-repo.ts';

export {
  DynamoLeadContactObservationsRepo,
  DynamoLeadContactPointsRepo,
  DynamoLeadContactsRepo,
  DynamoLeadConversionDecisionsRepo,
  DynamoLeadConversionFeedbackOutboxRepo,
  DynamoLeadConversionFeedbackOutcomesRepo,
  DynamoLeadFollowupWorkRepo,
  DynamoJourneyEventsRepo,
  DynamoJourneysRepo,
  DynamoLeadRecordsRepo,
  DynamoProviderContactProjectionsRepo,
  DynamoProviderConversionDestinationsRepo,
};

export type LeadPlatformRepos = {
  contacts: LeadContactsRepo;
  contactObservations: LeadContactObservationsRepo;
  contactPoints: LeadContactPointsRepo;
  journeys: JourneysRepo;
  journeyEvents: JourneyEventsRepo;
  followupWork: LeadFollowupWorkRepo;
  leadRecords: LeadRecordsRepo;
  providerContactProjections: ProviderContactProjectionsRepo;
  conversionDecisions: LeadConversionDecisionsRepo;
  conversionFeedbackOutbox: LeadConversionFeedbackOutboxRepo;
  conversionFeedbackOutcomes: LeadConversionFeedbackOutcomesRepo;
  providerConversionDestinations: ProviderConversionDestinationsRepo;
};

export function createDynamoLeadPlatformRepos(args: {
  db: DynamoDBDocumentClient;
  contactObservationsTableName: string;
  contactPointsTableName: string;
  contactsTableName: string;
  journeysTableName: string;
  journeyEventsTableName: string;
  followupWorkTableName: string;
  leadRecordsTableName: string;
  providerContactProjectionsTableName: string;
  conversionDecisionsTableName: string;
  conversionFeedbackOutboxTableName: string;
  conversionFeedbackOutcomesTableName: string;
  providerConversionDestinationsTableName: string;
}): LeadPlatformRepos {
  return {
    contacts: new DynamoLeadContactsRepo(args.db, args.contactsTableName),
    contactObservations: new DynamoLeadContactObservationsRepo(
      args.db,
      args.contactObservationsTableName,
    ),
    contactPoints: new DynamoLeadContactPointsRepo(args.db, args.contactPointsTableName),
    journeys: new DynamoJourneysRepo(args.db, args.journeysTableName),
    journeyEvents: new DynamoJourneyEventsRepo(args.db, args.journeyEventsTableName),
    followupWork: new DynamoLeadFollowupWorkRepo(args.db, args.followupWorkTableName),
    leadRecords: new DynamoLeadRecordsRepo(args.db, args.leadRecordsTableName),
    providerContactProjections: new DynamoProviderContactProjectionsRepo(
      args.db,
      args.providerContactProjectionsTableName,
    ),
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
