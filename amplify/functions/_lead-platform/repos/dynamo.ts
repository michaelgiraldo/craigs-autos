import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoLeadContactsRepo } from './dynamo/contacts.ts';
import { DynamoJourneyEventsRepo } from './dynamo/events.ts';
import { DynamoJourneysRepo } from './dynamo/journeys.ts';
import { DynamoLeadRecordsRepo } from './dynamo/lead-records.ts';
import type { LeadContactsRepo } from './contacts-repo.ts';
import type { JourneyEventsRepo } from './events-repo.ts';
import type { JourneysRepo } from './journeys-repo.ts';
import type { LeadRecordsRepo } from './lead-records-repo.ts';

export {
  DynamoLeadContactsRepo,
  DynamoJourneyEventsRepo,
  DynamoJourneysRepo,
  DynamoLeadRecordsRepo,
};

export type LeadPlatformRepos = {
  contacts: LeadContactsRepo;
  journeys: JourneysRepo;
  journeyEvents: JourneyEventsRepo;
  leadRecords: LeadRecordsRepo;
};

export function createDynamoLeadPlatformRepos(args: {
  db: DynamoDBDocumentClient;
  contactsTableName: string;
  journeysTableName: string;
  journeyEventsTableName: string;
  leadRecordsTableName: string;
}): LeadPlatformRepos {
  return {
    contacts: new DynamoLeadContactsRepo(args.db, args.contactsTableName),
    journeys: new DynamoJourneysRepo(args.db, args.journeysTableName),
    journeyEvents: new DynamoJourneyEventsRepo(args.db, args.journeyEventsTableName),
    leadRecords: new DynamoLeadRecordsRepo(args.db, args.leadRecordsTableName),
  };
}
