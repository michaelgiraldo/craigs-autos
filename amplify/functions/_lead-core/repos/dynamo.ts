import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { LeadActionTokensRepo } from './action-tokens-repo.ts';
import { DynamoLeadActionTokensRepo } from './dynamo/action-tokens.ts';
import { DynamoLeadContactsRepo } from './dynamo/contacts.ts';
import { DynamoJourneyEventsRepo } from './dynamo/events.ts';
import { DynamoJourneysRepo } from './dynamo/journeys.ts';
import { DynamoLeadRecordsRepo } from './dynamo/lead-records.ts';
import type { LeadContactsRepo } from './contacts-repo.ts';
import type { JourneyEventsRepo } from './events-repo.ts';
import type { JourneysRepo } from './journeys-repo.ts';
import type { LeadRecordsRepo } from './lead-records-repo.ts';

export {
  DynamoLeadActionTokensRepo,
  DynamoLeadContactsRepo,
  DynamoJourneyEventsRepo,
  DynamoJourneysRepo,
  DynamoLeadRecordsRepo,
};

export type LeadCoreRepos = {
  actionTokens: LeadActionTokensRepo;
  contacts: LeadContactsRepo;
  journeys: JourneysRepo;
  journeyEvents: JourneyEventsRepo;
  leadRecords: LeadRecordsRepo;
};

export function createDynamoLeadCoreRepos(args: {
  db: DynamoDBDocumentClient;
  actionTokensTableName: string;
  contactsTableName: string;
  journeysTableName: string;
  journeyEventsTableName: string;
  leadRecordsTableName: string;
}): LeadCoreRepos {
  return {
    actionTokens: new DynamoLeadActionTokensRepo(args.db, args.actionTokensTableName),
    contacts: new DynamoLeadContactsRepo(args.db, args.contactsTableName),
    journeys: new DynamoJourneysRepo(args.db, args.journeysTableName),
    journeyEvents: new DynamoJourneyEventsRepo(args.db, args.journeyEventsTableName),
    leadRecords: new DynamoLeadRecordsRepo(args.db, args.leadRecordsTableName),
  };
}
