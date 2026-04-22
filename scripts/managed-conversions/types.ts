import type { ManagedConversionFeedbackStatus } from '@craigs/contracts/managed-conversion-contract';
import type {
  LeadConversionDecision,
  LeadConversionFeedbackOutboxItem,
  LeadConversionFeedbackOutcome,
  ProviderConversionDestination,
} from '../../amplify/functions/_lead-platform/domain/conversion-feedback.ts';
import type { LeadContact } from '../../amplify/functions/_lead-platform/domain/contact.ts';
import type { LeadRecord } from '../../amplify/functions/_lead-platform/domain/lead-record.ts';
import type {
  DynamoLeadContactsRepo,
  DynamoLeadConversionDecisionsRepo,
  DynamoLeadConversionFeedbackOutboxRepo,
  DynamoLeadConversionFeedbackOutcomesRepo,
  DynamoLeadRecordsRepo,
  DynamoProviderConversionDestinationsRepo,
} from '../../amplify/functions/_lead-platform/repos/dynamo.ts';
import type { ManagedConversionFeedbackContext } from '../../amplify/functions/_lead-platform/services/conversion-feedback/adapter-types.ts';

export type Command =
  | 'validate'
  | 'readiness'
  | 'sync'
  | 'list'
  | 'list-destinations'
  | 'runtime'
  | 'list-decisions'
  | 'list-outbox'
  | 'inspect-outbox'
  | 'dry-run-outbox'
  | 'invoke-worker'
  | 'env-template'
  | 'help';

export type CliOptions = {
  command: Command;
  configPath: string;
  envFile: string | null;
  destinationTableName: string | null;
  decisionsTableName: string | null;
  outboxTableName: string | null;
  outcomesTableName: string | null;
  leadRecordsTableName: string | null;
  contactsTableName: string | null;
  workerFunctionName: string | null;
  discoverWorker: boolean;
  workerNameContains: string;
  profile: string | null;
  region: string | null;
  apply: boolean;
  allowUnready: boolean;
  json: boolean;
  status: ManagedConversionFeedbackStatus | null;
  leadRecordId: string | null;
  decisionId: string | null;
  outboxId: string | null;
  limit: number;
  dueNow: boolean;
  batchSize: number | null;
};

export type LeadPlatformTableKey =
  | 'destinations'
  | 'decisions'
  | 'outbox'
  | 'outcomes'
  | 'leadRecords'
  | 'contacts';

export type RuntimeTableConfig = Record<LeadPlatformTableKey, string | null>;

export type WorkerDiscoveryCandidate = {
  functionName: string;
  description: string | null;
  lastModified: string | null;
  reasons: string[];
};

export type WorkerDiscovery = {
  enabled: boolean;
  nameContains: string;
  selectedFunctionName: string | null;
  reason: 'explicit' | 'disabled' | 'not_needed' | 'not_found' | 'selected' | 'ambiguous';
  candidates: WorkerDiscoveryCandidate[];
};

export type RuntimeResolution = {
  env: Record<string, string | undefined>;
  lambdaEnv: Record<string, string | undefined>;
  workerFunctionName: string | null;
  workerDiscovery: WorkerDiscovery;
  tables: RuntimeTableConfig;
  tableSources: Record<LeadPlatformTableKey, string>;
};

export type ConversionOpsRepos = {
  contacts: DynamoLeadContactsRepo;
  decisions: DynamoLeadConversionDecisionsRepo;
  destinations: DynamoProviderConversionDestinationsRepo;
  leadRecords: DynamoLeadRecordsRepo;
  outbox: DynamoLeadConversionFeedbackOutboxRepo;
  outcomes: DynamoLeadConversionFeedbackOutcomesRepo;
};

export type OutboxContext = {
  runtime: RuntimeResolution;
  item: LeadConversionFeedbackOutboxItem;
  decision: LeadConversionDecision;
  leadRecord: LeadRecord;
  contact: LeadContact | null;
  destination: ProviderConversionDestination;
  outcomes: LeadConversionFeedbackOutcome[];
  context: ManagedConversionFeedbackContext;
};
