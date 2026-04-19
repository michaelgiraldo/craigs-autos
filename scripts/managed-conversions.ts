import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  GetFunctionConfigurationCommand,
  InvokeCommand,
  LambdaClient,
  ListFunctionsCommand,
  type FunctionConfiguration,
} from '@aws-sdk/client-lambda';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  type ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  MANAGED_CONVERSION_FEEDBACK_STATUSES,
  type ManagedConversionFeedbackStatus,
} from '@craigs/contracts/managed-conversion-contract';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  LeadConversionDecision,
  LeadConversionFeedbackOutboxItem,
  LeadConversionFeedbackOutcome,
  ProviderConversionDestination,
} from '../amplify/functions/_lead-platform/domain/conversion-feedback.ts';
import type { LeadContact } from '../amplify/functions/_lead-platform/domain/contact.ts';
import type { LeadRecord } from '../amplify/functions/_lead-platform/domain/lead-record.ts';
import {
  DynamoLeadContactsRepo,
  DynamoLeadConversionDecisionsRepo,
  DynamoLeadConversionFeedbackOutboxRepo,
  DynamoLeadConversionFeedbackOutcomesRepo,
  DynamoLeadRecordsRepo,
  DynamoProviderConversionDestinationsRepo,
} from '../amplify/functions/_lead-platform/repos/dynamo.ts';
import type { ManagedConversionFeedbackContext } from '../amplify/functions/_lead-platform/services/conversion-feedback/adapter-types.ts';
import {
  MANAGED_CONVERSION_PROVIDER_DEFINITIONS,
  MANAGED_CONVERSION_PROVIDER_CONFIG_FIELDS,
} from '../amplify/functions/_lead-platform/services/conversion-feedback/adapter-registry.ts';
import type { ManagedConversionProviderDefinition } from '../amplify/functions/_lead-platform/services/conversion-feedback/provider-definition.ts';
import {
  buildProviderConversionDestinationFromConfig,
  evaluateManagedConversionDestinationConfigReadiness,
  parseManagedConversionDestinationConfig,
  type DestinationReadiness,
  type ManagedConversionDestinationConfig,
} from '../amplify/functions/_lead-platform/services/provider-conversion-destination-config.ts';

type Command =
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

type CliOptions = {
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

type LeadPlatformTableKey =
  | 'destinations'
  | 'decisions'
  | 'outbox'
  | 'outcomes'
  | 'leadRecords'
  | 'contacts';

type RuntimeTableConfig = Record<LeadPlatformTableKey, string | null>;

type RuntimeResolution = {
  env: Record<string, string | undefined>;
  lambdaEnv: Record<string, string | undefined>;
  workerFunctionName: string | null;
  workerDiscovery: WorkerDiscovery;
  tables: RuntimeTableConfig;
  tableSources: Record<LeadPlatformTableKey, string>;
};

type WorkerDiscoveryCandidate = {
  functionName: string;
  description: string | null;
  lastModified: string | null;
  reasons: string[];
};

type WorkerDiscovery = {
  enabled: boolean;
  nameContains: string;
  selectedFunctionName: string | null;
  reason: 'explicit' | 'disabled' | 'not_needed' | 'not_found' | 'selected' | 'ambiguous';
  candidates: WorkerDiscoveryCandidate[];
};

type ConversionOpsRepos = {
  contacts: DynamoLeadContactsRepo;
  decisions: DynamoLeadConversionDecisionsRepo;
  destinations: DynamoProviderConversionDestinationsRepo;
  leadRecords: DynamoLeadRecordsRepo;
  outbox: DynamoLeadConversionFeedbackOutboxRepo;
  outcomes: DynamoLeadConversionFeedbackOutcomesRepo;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultConfigPath = 'config/managed-conversion-destinations.json';
const enabledPartition = 'enabled';
const defaultListLimit = 25;
const defaultWorkerNameContains = 'managedconversionfeedbackworker';

const commandNames: Command[] = [
  'validate',
  'readiness',
  'sync',
  'list',
  'list-destinations',
  'runtime',
  'list-decisions',
  'list-outbox',
  'inspect-outbox',
  'dry-run-outbox',
  'invoke-worker',
  'env-template',
  'help',
];

const tableEnvKeys: Record<LeadPlatformTableKey, string> = {
  contacts: 'LEAD_CONTACTS_TABLE_NAME',
  decisions: 'LEAD_CONVERSION_DECISIONS_TABLE_NAME',
  destinations: 'PROVIDER_CONVERSION_DESTINATIONS_TABLE_NAME',
  leadRecords: 'LEAD_RECORDS_TABLE_NAME',
  outbox: 'LEAD_CONVERSION_FEEDBACK_OUTBOX_TABLE_NAME',
  outcomes: 'LEAD_CONVERSION_FEEDBACK_OUTCOMES_TABLE_NAME',
};

function printHelp(): void {
  console.log(`Managed conversion operator CLI

Usage:
  npm run managed-conversions -- <command> [options]

Destination config commands:
  validate            Validate config-as-code without AWS access.
  readiness           Validate config and report provider readiness from config + env.
  sync                Dry-run or apply desired destinations to DynamoDB.
  list                Alias for list-destinations.
  list-destinations   List current DynamoDB ProviderConversionDestinations records.
  env-template        Print provider env keys, defaults, and secret markers.

Production operator commands:
  runtime             Resolve production table names from env/options/Lambda worker env.
  list-decisions      List conversion decisions by id, lead record, or recent scan.
  list-outbox         List conversion feedback outbox items by status, decision, lead, or scan.
  inspect-outbox      Inspect one outbox item with decision, lead, contact, destination, outcomes.
  dry-run-outbox      Build one provider payload from an outbox item without provider network calls.
  invoke-worker       Invoke the managed conversion feedback worker. Requires --apply to mutate.

AWS/runtime options:
  --profile <name>             AWS profile name.
  --region <name>              AWS region.
  --env-file <path>            Optional KEY=VALUE file used for readiness/runtime checks.
  --worker-function <name>     Lambda worker name/ARN used to discover table env vars and invoke.
  --worker-name-contains <txt> Lambda discovery pattern. Default: ${defaultWorkerNameContains}
  --no-discover                Disable automatic Lambda worker discovery.

Table options:
  --table <name>               Backward-compatible alias for --destinations-table.
  --destinations-table <name>  ProviderConversionDestinations table name.
  --decisions-table <name>     LeadConversionDecisions table name.
  --outbox-table <name>        LeadConversionFeedbackOutbox table name.
  --outcomes-table <name>      LeadConversionFeedbackOutcomes table name.
  --lead-records-table <name>  LeadRecords table name.
  --contacts-table <name>      LeadContacts table name.

Query options:
  --status <status>            Outbox status for list-outbox. Default: queued.
  --lead-record-id <id>        Filter decisions/outbox by lead record id.
  --decision-id <id>           Filter decisions/outbox by conversion decision id.
  --outbox-id <id>             Target one outbox item.
  --limit <n>                  List limit. Default: ${defaultListLimit}.
  --due-now                   With list-outbox --status, only show items due now.
  --batch-size <n>             Worker batch size for invoke-worker.

Safety/options:
  --config <path>       Config file. Default: ${defaultConfigPath}
  --apply               Write or invoke. Without this, sync/invoke-worker are dry-run.
  --allow-unready       Allow sync when an enabled provider is not ready.
  --json                Print machine-readable JSON.
  --help                Show this help.

Examples:
  npm run managed-conversions -- runtime --profile AdministratorAccess-281934899223
  npm run managed-conversions -- list-outbox --status queued --due-now --profile AdministratorAccess-281934899223
  npm run managed-conversions -- inspect-outbox --outbox-id outbox_123 --profile AdministratorAccess-281934899223
  npm run managed-conversions -- dry-run-outbox --outbox-id outbox_123 --profile AdministratorAccess-281934899223
  npm run managed-conversions -- invoke-worker --outbox-id outbox_123 --profile AdministratorAccess-281934899223 --apply
`);
}

function parsePositiveInteger(value: string, optionName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return parsed;
}

function parseStatus(value: string): ManagedConversionFeedbackStatus {
  if (MANAGED_CONVERSION_FEEDBACK_STATUSES.includes(value as ManagedConversionFeedbackStatus)) {
    return value as ManagedConversionFeedbackStatus;
  }
  throw new Error(
    `Unknown managed conversion feedback status: ${value}. Expected one of ${MANAGED_CONVERSION_FEEDBACK_STATUSES.join(', ')}.`,
  );
}

function parseArgs(argv: string[]): CliOptions {
  const command = (argv[0] ?? 'help') as Command;
  const options: CliOptions = {
    command,
    configPath: defaultConfigPath,
    envFile: null,
    destinationTableName: null,
    decisionsTableName: null,
    outboxTableName: null,
    outcomesTableName: null,
    leadRecordsTableName: null,
    contactsTableName: null,
    workerFunctionName: null,
    discoverWorker: true,
    workerNameContains: defaultWorkerNameContains,
    profile: null,
    region: null,
    apply: false,
    allowUnready: false,
    json: false,
    status: null,
    leadRecordId: null,
    decisionId: null,
    outboxId: null,
    limit: defaultListLimit,
    dueNow: false,
    batchSize: null,
  };

  if (!commandNames.includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = (name: string): string => {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new Error(`${name} requires a value.`);
      index += 1;
      return next;
    };

    if (arg === '--help') options.command = 'help';
    else if (arg === '--json') options.json = true;
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--allow-unready') options.allowUnready = true;
    else if (arg === '--due-now') options.dueNow = true;
    else if (arg === '--no-discover') options.discoverWorker = false;
    else if (arg === '--config') options.configPath = readValue('--config');
    else if (arg.startsWith('--config=')) options.configPath = arg.slice('--config='.length);
    else if (arg === '--env-file') options.envFile = readValue('--env-file');
    else if (arg.startsWith('--env-file=')) options.envFile = arg.slice('--env-file='.length);
    else if (arg === '--table' || arg === '--destinations-table') {
      options.destinationTableName = readValue(arg);
    } else if (arg.startsWith('--table=')) {
      options.destinationTableName = arg.slice('--table='.length);
    } else if (arg.startsWith('--destinations-table=')) {
      options.destinationTableName = arg.slice('--destinations-table='.length);
    } else if (arg === '--decisions-table') {
      options.decisionsTableName = readValue('--decisions-table');
    } else if (arg.startsWith('--decisions-table=')) {
      options.decisionsTableName = arg.slice('--decisions-table='.length);
    } else if (arg === '--outbox-table') {
      options.outboxTableName = readValue('--outbox-table');
    } else if (arg.startsWith('--outbox-table=')) {
      options.outboxTableName = arg.slice('--outbox-table='.length);
    } else if (arg === '--outcomes-table') {
      options.outcomesTableName = readValue('--outcomes-table');
    } else if (arg.startsWith('--outcomes-table=')) {
      options.outcomesTableName = arg.slice('--outcomes-table='.length);
    } else if (arg === '--lead-records-table') {
      options.leadRecordsTableName = readValue('--lead-records-table');
    } else if (arg.startsWith('--lead-records-table=')) {
      options.leadRecordsTableName = arg.slice('--lead-records-table='.length);
    } else if (arg === '--contacts-table') {
      options.contactsTableName = readValue('--contacts-table');
    } else if (arg.startsWith('--contacts-table=')) {
      options.contactsTableName = arg.slice('--contacts-table='.length);
    } else if (arg === '--worker-function') {
      options.workerFunctionName = readValue('--worker-function');
    } else if (arg.startsWith('--worker-function=')) {
      options.workerFunctionName = arg.slice('--worker-function='.length);
    } else if (arg === '--worker-name-contains') {
      options.workerNameContains = readValue('--worker-name-contains');
    } else if (arg.startsWith('--worker-name-contains=')) {
      options.workerNameContains = arg.slice('--worker-name-contains='.length);
    } else if (arg === '--profile') {
      options.profile = readValue('--profile');
    } else if (arg.startsWith('--profile=')) {
      options.profile = arg.slice('--profile='.length);
    } else if (arg === '--region') {
      options.region = readValue('--region');
    } else if (arg.startsWith('--region=')) {
      options.region = arg.slice('--region='.length);
    } else if (arg === '--status') {
      options.status = parseStatus(readValue('--status'));
    } else if (arg.startsWith('--status=')) {
      options.status = parseStatus(arg.slice('--status='.length));
    } else if (arg === '--lead-record-id') {
      options.leadRecordId = readValue('--lead-record-id');
    } else if (arg.startsWith('--lead-record-id=')) {
      options.leadRecordId = arg.slice('--lead-record-id='.length);
    } else if (arg === '--decision-id') {
      options.decisionId = readValue('--decision-id');
    } else if (arg.startsWith('--decision-id=')) {
      options.decisionId = arg.slice('--decision-id='.length);
    } else if (arg === '--outbox-id') {
      options.outboxId = readValue('--outbox-id');
    } else if (arg.startsWith('--outbox-id=')) {
      options.outboxId = arg.slice('--outbox-id='.length);
    } else if (arg === '--limit') {
      options.limit = parsePositiveInteger(readValue('--limit'), '--limit');
    } else if (arg.startsWith('--limit=')) {
      options.limit = parsePositiveInteger(arg.slice('--limit='.length), '--limit');
    } else if (arg === '--batch-size') {
      options.batchSize = parsePositiveInteger(readValue('--batch-size'), '--batch-size');
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = parsePositiveInteger(arg.slice('--batch-size='.length), '--batch-size');
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function resolvePath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.join(repoRoot, inputPath);
}

async function loadJsonFile(filePath: string): Promise<unknown> {
  const raw = await readFile(resolvePath(filePath), 'utf8');
  return JSON.parse(raw) as unknown;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function loadEnv(options: CliOptions): Promise<Record<string, string | undefined>> {
  const env: Record<string, string | undefined> = { ...process.env };
  if (!options.envFile) return env;

  const raw = await readFile(resolvePath(options.envFile), 'utf8');
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const normalized = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trim()
      : trimmed;
    const separator = normalized.indexOf('=');
    if (separator <= 0) continue;
    const key = normalized.slice(0, separator).trim();
    const value = unquote(normalized.slice(separator + 1));
    env[key] = value;
  }

  return env;
}

async function loadConfig(options: CliOptions): Promise<{
  config: ManagedConversionDestinationConfig;
  warnings: string[];
}> {
  const parsed = parseManagedConversionDestinationConfig(await loadJsonFile(options.configPath));
  if (!parsed.ok) {
    throw new Error(`Invalid managed conversion config:\n- ${parsed.errors.join('\n- ')}`);
  }
  return {
    config: parsed.config,
    warnings: parsed.warnings,
  };
}

function readinessFailures(readiness: DestinationReadiness[]): DestinationReadiness[] {
  return readiness.filter(
    (item) => item.enabled && item.status !== 'ready' && item.status !== 'disabled',
  );
}

function printReadiness(readiness: DestinationReadiness[]): void {
  console.log('Managed conversion destination readiness');
  console.log('destination         enabled  mode     status                    missing');
  for (const item of readiness) {
    console.log(
      [
        item.destination_key.padEnd(19),
        String(item.enabled ? 'yes' : 'no').padEnd(8),
        String(item.mode ?? '-').padEnd(8),
        item.status.padEnd(25),
        item.missing_config_keys.join(', ') || '-',
      ].join(''),
    );
  }
}

function printWarnings(warnings: string[], json: boolean): void {
  if (json || !warnings.length) return;
  for (const warning of warnings) {
    console.warn(`warning: ${warning}`);
  }
}

function applyAwsOptions(options: CliOptions): void {
  if (options.profile) process.env.AWS_PROFILE = options.profile;
}

function createDocumentClient(options: CliOptions): DynamoDBDocumentClient {
  applyAwsOptions(options);
  return DynamoDBDocumentClient.from(
    new DynamoDBClient({
      ...(options.region ? { region: options.region } : {}),
    }),
  );
}

function createLambdaClient(options: CliOptions): LambdaClient {
  applyAwsOptions(options);
  return new LambdaClient({
    ...(options.region ? { region: options.region } : {}),
  });
}

function emptyWorkerDiscovery(args: {
  enabled: boolean;
  nameContains?: string;
  reason: WorkerDiscovery['reason'];
  selectedFunctionName?: string | null;
}): WorkerDiscovery {
  return {
    enabled: args.enabled,
    nameContains: args.nameContains ?? defaultWorkerNameContains,
    selectedFunctionName: args.selectedFunctionName ?? null,
    reason: args.reason,
    candidates: [],
  };
}

function normalizeDiscoveryText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/gu, '');
}

function evaluateWorkerCandidate(
  fn: FunctionConfiguration,
  nameContains: string,
): WorkerDiscoveryCandidate | null {
  const functionName = fn.FunctionName ?? '';
  const description = fn.Description ?? '';
  const normalizedName = normalizeDiscoveryText(functionName);
  const normalizedDescription = normalizeDiscoveryText(description);
  const normalizedPattern = normalizeDiscoveryText(nameContains);
  const reasons = [
    normalizedPattern && normalizedName.includes(normalizedPattern) ? 'function_name' : null,
    normalizedDescription.includes('managedconversionfeedbackoutbox') ? 'description' : null,
    normalizedDescription.includes('managedconversionfeedbackworker') ? 'description' : null,
  ].filter((value): value is string => Boolean(value));

  if (!functionName || !reasons.length) return null;
  return {
    functionName,
    description: description || null,
    lastModified: fn.LastModified ?? null,
    reasons: [...new Set(reasons)],
  };
}

function sortWorkerCandidates(candidates: WorkerDiscoveryCandidate[]): WorkerDiscoveryCandidate[] {
  return [...candidates].sort((a, b) => {
    const aMs = a.lastModified ? Date.parse(a.lastModified) : 0;
    const bMs = b.lastModified ? Date.parse(b.lastModified) : 0;
    return bMs - aMs || a.functionName.localeCompare(b.functionName);
  });
}

async function discoverWorkerFunction(args: {
  options: CliOptions;
  nameContains: string;
}): Promise<WorkerDiscovery> {
  const lambda = createLambdaClient(args.options);
  const candidates: WorkerDiscoveryCandidate[] = [];
  let Marker: string | undefined;

  do {
    const result = await lambda.send(
      new ListFunctionsCommand({
        Marker,
        MaxItems: 50,
      }),
    );
    for (const fn of result.Functions ?? []) {
      const candidate = evaluateWorkerCandidate(fn, args.nameContains);
      if (candidate) candidates.push(candidate);
    }
    Marker = result.NextMarker;
  } while (Marker);

  const sortedCandidates = sortWorkerCandidates(candidates);
  return {
    enabled: true,
    nameContains: args.nameContains,
    selectedFunctionName:
      sortedCandidates.length === 1 ? (sortedCandidates[0]?.functionName ?? null) : null,
    reason:
      sortedCandidates.length === 0
        ? 'not_found'
        : sortedCandidates.length === 1
          ? 'selected'
          : 'ambiguous',
    candidates: sortedCandidates,
  };
}

function optionTableName(options: CliOptions, key: LeadPlatformTableKey): string | null {
  switch (key) {
    case 'contacts':
      return options.contactsTableName;
    case 'decisions':
      return options.decisionsTableName;
    case 'destinations':
      return options.destinationTableName;
    case 'leadRecords':
      return options.leadRecordsTableName;
    case 'outbox':
      return options.outboxTableName;
    case 'outcomes':
      return options.outcomesTableName;
  }
}

function resolveWorkerFunctionName(
  options: CliOptions,
  env: Record<string, string | undefined>,
): string | null {
  return (
    options.workerFunctionName ??
    env.MANAGED_CONVERSION_FEEDBACK_WORKER_FUNCTION_NAME ??
    env.MANAGED_CONVERSION_WORKER_FUNCTION_NAME ??
    env.AWS_LAMBDA_FUNCTION_NAME ??
    null
  );
}

async function loadWorkerLambdaEnv(args: {
  options: CliOptions;
  workerFunctionName: string | null;
}): Promise<Record<string, string | undefined>> {
  if (!args.workerFunctionName) return {};
  const lambda = createLambdaClient(args.options);
  const result = await lambda.send(
    new GetFunctionConfigurationCommand({
      FunctionName: args.workerFunctionName,
    }),
  );
  return result.Environment?.Variables ?? {};
}

function resolveTable(args: {
  key: LeadPlatformTableKey;
  options: CliOptions;
  localEnv: Record<string, string | undefined>;
  lambdaEnv: Record<string, string | undefined>;
}): { name: string | null; source: string } {
  const envKey = tableEnvKeys[args.key];
  const optionValue = optionTableName(args.options, args.key);
  if (optionValue) return { name: optionValue, source: 'option' };
  if (args.localEnv[envKey]) return { name: args.localEnv[envKey], source: 'environment' };
  if (args.lambdaEnv[envKey]) return { name: args.lambdaEnv[envKey], source: 'worker_lambda_env' };
  return { name: null, source: 'missing' };
}

async function resolveRuntime(
  options: CliOptions,
  settings: { loadLambdaEnv?: boolean; discoverWorker?: boolean } = {},
): Promise<RuntimeResolution> {
  const localEnv = await loadEnv(options);
  const shouldLoadLambdaEnv = settings.loadLambdaEnv ?? true;
  const shouldDiscoverWorker = settings.discoverWorker ?? shouldLoadLambdaEnv;
  let workerFunctionName = resolveWorkerFunctionName(options, localEnv);
  let workerDiscovery = workerFunctionName
    ? emptyWorkerDiscovery({
        enabled: false,
        reason: 'explicit',
        selectedFunctionName: workerFunctionName,
        nameContains: options.workerNameContains,
      })
    : emptyWorkerDiscovery({
        enabled: false,
        reason: shouldDiscoverWorker ? 'not_needed' : 'disabled',
        nameContains: options.workerNameContains,
      });

  if (!workerFunctionName && shouldDiscoverWorker && options.discoverWorker) {
    workerDiscovery = await discoverWorkerFunction({
      options,
      nameContains: options.workerNameContains,
    });
    workerFunctionName = workerDiscovery.selectedFunctionName;
  }

  if (!workerFunctionName && shouldDiscoverWorker && !options.discoverWorker) {
    workerDiscovery = emptyWorkerDiscovery({
      enabled: false,
      reason: 'disabled',
      nameContains: options.workerNameContains,
    });
  }

  const lambdaEnv = shouldLoadLambdaEnv
    ? await loadWorkerLambdaEnv({ options, workerFunctionName })
    : {};
  const env = { ...lambdaEnv, ...localEnv };
  const tableSources = {} as Record<LeadPlatformTableKey, string>;
  const tables = {} as RuntimeTableConfig;

  for (const key of Object.keys(tableEnvKeys) as LeadPlatformTableKey[]) {
    const resolved = resolveTable({ key, options, localEnv, lambdaEnv });
    tables[key] = resolved.name;
    tableSources[key] = resolved.source;
    if (resolved.name) env[tableEnvKeys[key]] = resolved.name;
  }

  return {
    env,
    lambdaEnv,
    workerFunctionName,
    workerDiscovery,
    tables,
    tableSources,
  };
}

function requireTables(
  runtime: RuntimeResolution,
  keys: LeadPlatformTableKey[],
): Record<LeadPlatformTableKey, string> {
  const missing = keys.filter((key) => !runtime.tables[key]);
  if (missing.length) {
    throw new Error(
      `Missing required table names: ${missing
        .map((key) => tableEnvKeys[key])
        .join(
          ', ',
        )}. Pass explicit table options, set env vars, or pass --worker-function so the CLI can read the worker Lambda environment.`,
    );
  }

  return runtime.tables as Record<LeadPlatformTableKey, string>;
}

function createRepos(args: {
  db: DynamoDBDocumentClient;
  tables: Record<LeadPlatformTableKey, string>;
}): ConversionOpsRepos {
  return {
    contacts: new DynamoLeadContactsRepo(args.db, args.tables.contacts),
    decisions: new DynamoLeadConversionDecisionsRepo(args.db, args.tables.decisions),
    destinations: new DynamoProviderConversionDestinationsRepo(args.db, args.tables.destinations),
    leadRecords: new DynamoLeadRecordsRepo(args.db, args.tables.leadRecords),
    outbox: new DynamoLeadConversionFeedbackOutboxRepo(args.db, args.tables.outbox),
    outcomes: new DynamoLeadConversionFeedbackOutcomesRepo(args.db, args.tables.outcomes),
  };
}

async function getDestination(args: {
  db: DynamoDBDocumentClient;
  tableName: string;
  destinationKey: string;
}): Promise<ProviderConversionDestination | null> {
  const result = await args.db.send(
    new GetCommand({
      TableName: args.tableName,
      Key: { destination_key: args.destinationKey },
    }),
  );
  return (result.Item as ProviderConversionDestination | undefined) ?? null;
}

async function putDestination(args: {
  db: DynamoDBDocumentClient;
  tableName: string;
  destination: ProviderConversionDestination;
}): Promise<void> {
  await args.db.send(
    new PutCommand({
      TableName: args.tableName,
      Item: {
        ...args.destination,
        ...(args.destination.enabled ? { enabled_partition: enabledPartition } : {}),
      },
    }),
  );
}

async function scanTable<T>(args: {
  db: DynamoDBDocumentClient;
  tableName: string;
  limit?: number;
}): Promise<T[]> {
  const records: T[] = [];
  let ExclusiveStartKey: ScanCommandInput['ExclusiveStartKey'];
  const limit = args.limit ?? defaultListLimit;

  do {
    const remaining = Math.max(limit - records.length, 1);
    const result = await args.db.send(
      new ScanCommand({
        TableName: args.tableName,
        Limit: remaining,
        ExclusiveStartKey,
      }),
    );
    records.push(...((result.Items as T[] | undefined) ?? []).slice(0, remaining));
    ExclusiveStartKey = records.length >= limit ? undefined : result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return records;
}

async function scanDestinations(args: {
  db: DynamoDBDocumentClient;
  tableName: string;
}): Promise<ProviderConversionDestination[]> {
  const records = await scanTable<ProviderConversionDestination>({
    db: args.db,
    tableName: args.tableName,
    limit: Number.MAX_SAFE_INTEGER,
  });
  return records.sort((a, b) => a.destination_key.localeCompare(b.destination_key));
}

function redactDestination(
  destination: ProviderConversionDestination,
): ProviderConversionDestination {
  const fieldsByKey = new Map(
    MANAGED_CONVERSION_PROVIDER_CONFIG_FIELDS.map((field) => [field.providerConfigKey, field]),
  );
  const providerConfig = Object.fromEntries(
    Object.entries(destination.provider_config).map(([key, value]) => [
      key,
      fieldsByKey.get(key)?.secret && value ? '[redacted]' : value,
    ]),
  );

  return {
    ...destination,
    provider_config: providerConfig,
  };
}

function formatDate(ms: number | null | undefined): string {
  return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : '-';
}

function truncate(value: string | null | undefined, length = 72): string {
  if (!value) return '-';
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function sortDecisions(items: LeadConversionDecision[]): LeadConversionDecision[] {
  return [...items].sort((a, b) => b.occurred_at_ms - a.occurred_at_ms);
}

function sortOutboxItems(
  items: LeadConversionFeedbackOutboxItem[],
): LeadConversionFeedbackOutboxItem[] {
  return [...items].sort((a, b) => b.updated_at_ms - a.updated_at_ms);
}

function sortOutcomes(items: LeadConversionFeedbackOutcome[]): LeadConversionFeedbackOutcome[] {
  return [...items].sort((a, b) => b.occurred_at_ms - a.occurred_at_ms);
}

function printDecisionRows(items: LeadConversionDecision[]): void {
  console.log(
    'decision_id                              type            status      lead_record_id                           occurred_at',
  );
  for (const item of items) {
    console.log(
      [
        item.decision_id.padEnd(41),
        item.decision_type.padEnd(16),
        item.decision_status.padEnd(12),
        item.lead_record_id.padEnd(41),
        formatDate(item.occurred_at_ms),
      ].join(''),
    );
  }
}

function printOutboxRows(items: LeadConversionFeedbackOutboxItem[]): void {
  console.log(
    'outbox_id                                destination       status                    attempts  next_attempt_at              updated_at',
  );
  for (const item of items) {
    console.log(
      [
        item.outbox_id.padEnd(41),
        item.destination_key.padEnd(18),
        item.status.padEnd(26),
        String(item.attempt_count).padEnd(10),
        formatDate(item.next_attempt_at_ms).padEnd(29),
        formatDate(item.updated_at_ms),
      ].join(''),
    );
  }
}

function printOutcomeRows(items: LeadConversionFeedbackOutcome[]): void {
  if (!items.length) {
    console.log('outcomes: (none)');
    return;
  }
  console.log('outcomes');
  for (const item of items) {
    console.log(
      `- ${formatDate(item.occurred_at_ms)} ${item.destination_key} ${item.status}: ${truncate(
        item.message,
      )}`,
    );
  }
}

async function runValidate(options: CliOptions): Promise<void> {
  const { config, warnings } = await loadConfig(options);
  printWarnings(warnings, options.json);

  const payload = {
    ok: true,
    configPath: options.configPath,
    destinationCount: config.destinations.length,
    destinationKeys: config.destinations.map((destination) => destination.destination_key),
    warnings,
  };

  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(`Managed conversion config is valid: ${options.configPath}`);
    console.log(`Destinations: ${payload.destinationKeys.join(', ')}`);
  }
}

async function runReadiness(options: CliOptions): Promise<void> {
  const { config, warnings } = await loadConfig(options);
  const env = await loadEnv(options);
  const readiness = evaluateManagedConversionDestinationConfigReadiness({ config, env });
  const failures = readinessFailures(readiness);
  printWarnings(warnings, options.json);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: failures.length === 0,
          warnings,
          readiness,
        },
        null,
        2,
      ),
    );
  } else {
    printReadiness(readiness);
  }

  if (failures.length) process.exitCode = 1;
}

async function runSync(options: CliOptions): Promise<void> {
  const { config, warnings } = await loadConfig(options);
  const env = await loadEnv(options);
  const readiness = evaluateManagedConversionDestinationConfigReadiness({ config, env });
  const failures = readinessFailures(readiness);
  if (failures.length && !options.allowUnready) {
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            reason: 'Enabled destinations are not ready. Pass --allow-unready to sync anyway.',
            readiness,
          },
          null,
          2,
        ),
      );
    } else {
      printReadiness(readiness);
      console.error('Enabled destinations are not ready. Pass --allow-unready to sync anyway.');
    }
    process.exitCode = 1;
    return;
  }

  const needsWorkerRuntime =
    !options.destinationTableName && !env.PROVIDER_CONVERSION_DESTINATIONS_TABLE_NAME;
  const runtime = await resolveRuntime(options, {
    loadLambdaEnv: needsWorkerRuntime,
    discoverWorker: needsWorkerRuntime,
  });
  const tables = requireTables(runtime, ['destinations']);
  const tableName = tables.destinations;
  const db = options.apply ? createDocumentClient(options) : null;
  const nowMs = Date.now();
  const planned: ProviderConversionDestination[] = [];

  for (const entry of config.destinations) {
    const existing = db
      ? await getDestination({
          db,
          tableName,
          destinationKey: entry.destination_key,
        })
      : null;
    const destination = buildProviderConversionDestinationFromConfig({
      entry,
      nowMs,
      existing,
    });
    planned.push(destination);
    if (db) {
      await putDestination({ db, tableName, destination });
    }
  }

  printWarnings(warnings, options.json);
  const payload = {
    ok: true,
    mode: options.apply ? 'applied' : 'dry_run',
    tableName,
    destinations: planned.map(redactDestination),
  };

  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(
      `${options.apply ? 'Applied' : 'Dry-run planned'} ${planned.length} provider destination records to ${tableName}.`,
    );
    for (const destination of planned) {
      console.log(
        `${destination.destination_key}: enabled=${destination.enabled} source=${destination.config_source}`,
      );
    }
    if (!options.apply) console.log('No writes made. Re-run with --apply to write.');
  }
}

async function runListDestinations(options: CliOptions): Promise<void> {
  const runtime = await resolveRuntime(options);
  const tables = requireTables(runtime, ['destinations']);
  const tableName = tables.destinations;
  const db = createDocumentClient(options);
  const destinations = (await scanDestinations({ db, tableName })).map(redactDestination);

  if (options.json) {
    console.log(JSON.stringify({ ok: true, tableName, destinations }, null, 2));
    return;
  }

  console.log(`ProviderConversionDestinations in ${tableName}`);
  if (!destinations.length) {
    console.log('(empty)');
    return;
  }
  for (const destination of destinations) {
    console.log(
      `${destination.destination_key}: enabled=${destination.enabled} mode=${destination.delivery_mode} source=${destination.config_source}`,
    );
  }
}

async function runRuntime(options: CliOptions): Promise<void> {
  const runtime = await resolveRuntime(options);
  const payload = {
    ok: true,
    workerFunctionName: runtime.workerFunctionName,
    workerDiscovery: runtime.workerDiscovery,
    workerFunctionEnvLoaded: Object.keys(runtime.lambdaEnv).length > 0,
    tables: runtime.tables,
    tableSources: runtime.tableSources,
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('Managed conversion runtime');
  console.log(`worker function: ${runtime.workerFunctionName ?? '-'}`);
  console.log(
    `worker discovery: ${runtime.workerDiscovery.reason} (${runtime.workerDiscovery.candidates.length} candidate${runtime.workerDiscovery.candidates.length === 1 ? '' : 's'})`,
  );
  for (const candidate of runtime.workerDiscovery.candidates) {
    console.log(
      `candidate: ${candidate.functionName} reasons=${candidate.reasons.join(',')} modified=${candidate.lastModified ?? '-'}`,
    );
  }
  console.log(`worker env loaded: ${payload.workerFunctionEnvLoaded ? 'yes' : 'no'}`);
  for (const key of Object.keys(tableEnvKeys) as LeadPlatformTableKey[]) {
    console.log(
      `${tableEnvKeys[key]}=${runtime.tables[key] ?? '-'} (${runtime.tableSources[key]})`,
    );
  }
}

async function runListDecisions(options: CliOptions): Promise<void> {
  const runtime = await resolveRuntime(options);
  const tables = requireTables(runtime, ['decisions']);
  const db = createDocumentClient(options);
  const repo = new DynamoLeadConversionDecisionsRepo(db, tables.decisions);
  let decisions: LeadConversionDecision[];

  if (options.decisionId) {
    decisions = [await repo.getById(options.decisionId)].filter(
      (item): item is LeadConversionDecision => Boolean(item),
    );
  } else if (options.leadRecordId) {
    decisions = await repo.listByLeadRecordId(options.leadRecordId);
  } else {
    decisions = await scanTable<LeadConversionDecision>({
      db,
      tableName: tables.decisions,
      limit: options.limit,
    });
  }

  decisions = sortDecisions(decisions).slice(0, options.limit);

  if (options.json) {
    console.log(JSON.stringify({ ok: true, tableName: tables.decisions, decisions }, null, 2));
    return;
  }

  console.log(`LeadConversionDecisions in ${tables.decisions}`);
  if (!decisions.length) {
    console.log('(empty)');
    return;
  }
  printDecisionRows(decisions);
}

async function runListOutbox(options: CliOptions): Promise<void> {
  const runtime = await resolveRuntime(options);
  const tables = requireTables(runtime, ['outbox']);
  const db = createDocumentClient(options);
  const repo = new DynamoLeadConversionFeedbackOutboxRepo(db, tables.outbox);
  let items: LeadConversionFeedbackOutboxItem[];

  if (options.outboxId) {
    items = [await repo.getById(options.outboxId)].filter(
      (item): item is LeadConversionFeedbackOutboxItem => Boolean(item),
    );
  } else if (options.decisionId) {
    items = await repo.listByDecisionId(options.decisionId);
  } else if (options.leadRecordId) {
    items = await repo.listByLeadRecordId(options.leadRecordId);
  } else if (options.status || options.dueNow) {
    items = await repo.listByStatus(options.status ?? 'queued', {
      dueAtMs: options.dueNow ? Date.now() : undefined,
      limit: options.limit,
    });
  } else {
    items = await scanTable<LeadConversionFeedbackOutboxItem>({
      db,
      tableName: tables.outbox,
      limit: options.limit,
    });
  }

  items = sortOutboxItems(items).slice(0, options.limit);

  if (options.json) {
    console.log(
      JSON.stringify({ ok: true, tableName: tables.outbox, outboxItems: items }, null, 2),
    );
    return;
  }

  console.log(`LeadConversionFeedbackOutbox in ${tables.outbox}`);
  if (!items.length) {
    console.log('(empty)');
    return;
  }
  printOutboxRows(items);
}

async function loadOutboxContext(args: { options: CliOptions; outboxId: string }): Promise<{
  runtime: RuntimeResolution;
  item: LeadConversionFeedbackOutboxItem;
  decision: LeadConversionDecision;
  leadRecord: LeadRecord;
  contact: LeadContact | null;
  destination: ProviderConversionDestination;
  outcomes: LeadConversionFeedbackOutcome[];
  context: ManagedConversionFeedbackContext;
}> {
  const runtime = await resolveRuntime(args.options);
  const tables = requireTables(runtime, [
    'contacts',
    'decisions',
    'destinations',
    'leadRecords',
    'outbox',
    'outcomes',
  ]);
  const db = createDocumentClient(args.options);
  const repos = createRepos({ db, tables });
  const item = await repos.outbox.getById(args.outboxId);
  if (!item) throw new Error(`Outbox item not found: ${args.outboxId}`);

  const [decision, leadRecord, destination, outcomes] = await Promise.all([
    repos.decisions.getById(item.decision_id),
    repos.leadRecords.getById(item.lead_record_id),
    repos.destinations.getByKey(item.destination_key),
    repos.outcomes.listByOutboxId(item.outbox_id),
  ]);
  if (!decision) throw new Error(`Conversion decision not found: ${item.decision_id}`);
  if (!leadRecord) throw new Error(`Lead record not found: ${item.lead_record_id}`);
  if (!destination) throw new Error(`Destination not found: ${item.destination_key}`);

  const contact = leadRecord.contact_id
    ? await repos.contacts.getById(leadRecord.contact_id)
    : null;
  const context: ManagedConversionFeedbackContext = {
    item,
    decision,
    leadRecord,
    contact,
    destination,
    nowMs: Date.now(),
  };

  return {
    runtime,
    item,
    decision,
    leadRecord,
    contact,
    destination,
    outcomes: sortOutcomes(outcomes),
    context,
  };
}

async function runInspectOutbox(options: CliOptions): Promise<void> {
  if (!options.outboxId) throw new Error('inspect-outbox requires --outbox-id.');
  const details = await loadOutboxContext({ options, outboxId: options.outboxId });

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          outboxItem: details.item,
          decision: details.decision,
          leadRecord: details.leadRecord,
          contact: details.contact,
          destination: redactDestination(details.destination),
          outcomes: details.outcomes,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`outbox: ${details.item.outbox_id}`);
  console.log(`status: ${details.item.status} (${details.item.status_reason ?? '-'})`);
  console.log(
    `destination: ${details.destination.destination_label} (${details.destination.destination_key})`,
  );
  console.log(`decision: ${details.decision.decision_type} ${details.decision.decision_status}`);
  console.log(`lead: ${details.leadRecord.title} (${details.leadRecord.lead_record_id})`);
  console.log(
    `contact: ${details.contact?.display_name ?? details.contact?.raw_email ?? details.contact?.raw_phone ?? '-'}`,
  );
  console.log(`attempts: ${details.item.attempt_count}`);
  console.log(`next attempt: ${formatDate(details.item.next_attempt_at_ms)}`);
  printOutcomeRows(details.outcomes);
}

function serializeRequest(request: unknown): Record<string, unknown> {
  return request && typeof request === 'object' && !Array.isArray(request)
    ? (request as Record<string, unknown>)
    : { value: request };
}

function evaluateProviderDryRun<TConfig, TRequest>(args: {
  definition: ManagedConversionProviderDefinition<TConfig, TRequest>;
  context: ManagedConversionFeedbackContext;
  env: Record<string, string | undefined>;
}): Record<string, unknown> {
  const config = args.definition.parseConfig(args.env, args.context.destination.provider_config);
  const mode = args.definition.getMode(config);
  const build = args.definition.buildPayload({ context: args.context, config });
  const missingValidationConfigKeys =
    args.definition.getMissingValidationConfigKeys?.(config) ?? [];
  const missingDeliveryConfigKeys = args.definition.getMissingDeliveryConfigKeys?.(config) ?? [];

  if (!build.ok) {
    return {
      ok: false,
      destination_key: args.context.destination.destination_key,
      destination_label: args.context.destination.destination_label,
      mode,
      status: build.status,
      errorCode: build.errorCode,
      message: build.message,
      missingConfigKeys: build.missingConfigKeys ?? missingValidationConfigKeys,
      missingDeliveryConfigKeys,
    };
  }

  return {
    ok: true,
    destination_key: args.context.destination.destination_key,
    destination_label: args.context.destination.destination_label,
    mode,
    status: 'validated',
    signalKeys: build.signalKeys,
    warnings: build.warnings,
    missingValidationConfigKeys,
    missingDeliveryConfigKeys,
    request: serializeRequest(build.request),
    ...(args.definition.summarizeDryRunPayload?.({
      context: args.context,
      config,
      build,
    }) ?? {}),
  };
}

async function runDryRunOutbox(options: CliOptions): Promise<void> {
  if (!options.outboxId) throw new Error('dry-run-outbox requires --outbox-id.');
  const details = await loadOutboxContext({ options, outboxId: options.outboxId });

  const definition = MANAGED_CONVERSION_PROVIDER_DEFINITIONS.find(
    (entry) => entry.key === details.destination.destination_key,
  ) as ManagedConversionProviderDefinition<unknown, unknown> | undefined;
  const payload =
    details.destination.delivery_mode === 'manual'
      ? {
          ok: true,
          destination_key: details.destination.destination_key,
          destination_label: details.destination.destination_label,
          mode: 'manual',
          status: 'manual',
          message:
            'Manual export destination is ready for operator follow-up; no provider API payload is built.',
        }
      : definition
        ? evaluateProviderDryRun({
            definition,
            context: details.context,
            env: details.runtime.env,
          })
        : {
            ok: false,
            destination_key: details.destination.destination_key,
            destination_label: details.destination.destination_label,
            status: 'needs_destination_config',
            message: `No provider definition exists for ${details.destination.destination_key}.`,
          };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Dry-run outbox ${details.item.outbox_id}`);
  console.log(`destination: ${details.destination.destination_label}`);
  console.log(`status: ${String(payload.status ?? '-')}`);
  if (payload.ok) {
    console.log(
      `signals: ${Array.isArray(payload.signalKeys) ? payload.signalKeys.join(', ') || '-' : '-'}`,
    );
    console.log('request:');
    console.log(JSON.stringify(payload.request ?? payload, null, 2));
  } else {
    console.log(`message: ${String(payload.message ?? '-')}`);
    console.log(JSON.stringify(payload, null, 2));
  }
}

function parseLambdaPayload(payload: Uint8Array | undefined): unknown {
  if (!payload) return null;
  const text = Buffer.from(payload).toString('utf8');
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'body' in parsed &&
      typeof (parsed as { body?: unknown }).body === 'string'
    ) {
      try {
        return {
          ...parsed,
          body: JSON.parse((parsed as { body: string }).body) as unknown,
        };
      } catch {
        return parsed;
      }
    }
    return parsed;
  } catch {
    return text;
  }
}

async function runInvokeWorker(options: CliOptions): Promise<void> {
  const runtime = await resolveRuntime(options, {
    loadLambdaEnv: false,
    discoverWorker: true,
  });
  if (!runtime.workerFunctionName) {
    throw new Error(
      'invoke-worker requires a discoverable worker Lambda, --worker-function, or MANAGED_CONVERSION_FEEDBACK_WORKER_FUNCTION_NAME.',
    );
  }

  const event = {
    ...(options.outboxId ? { outbox_id: options.outboxId } : {}),
    ...(options.batchSize ? { batch_size: options.batchSize } : {}),
  };
  if (!options.outboxId && !options.batchSize) {
    throw new Error('invoke-worker requires --outbox-id for one item or --batch-size for a batch.');
  }

  if (!options.apply) {
    const payload = {
      ok: true,
      mode: 'dry_run',
      workerFunctionName: runtime.workerFunctionName,
      event,
      message: 'No Lambda invocation made. Re-run with --apply to invoke the worker.',
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const lambda = createLambdaClient(options);
  const result = await lambda.send(
    new InvokeCommand({
      FunctionName: runtime.workerFunctionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(event)),
    }),
  );
  const payload = {
    ok: !result.FunctionError,
    workerFunctionName: runtime.workerFunctionName,
    statusCode: result.StatusCode,
    functionError: result.FunctionError,
    response: parseLambdaPayload(result.Payload),
  };

  console.log(JSON.stringify(payload, null, 2));
  if (result.FunctionError) process.exitCode = 1;
}

function runEnvTemplate(options: CliOptions): void {
  const lines = [
    '# Managed conversion provider env template',
    '# Keep secret values in AWS/Amplify secrets or local env files; never commit real secrets.',
  ];

  for (const field of MANAGED_CONVERSION_PROVIDER_CONFIG_FIELDS) {
    lines.push('');
    lines.push(`# ${field.description}`);
    if (field.secret) lines.push('# secret: true');
    if (field.requiredForModes?.length) {
      lines.push(`# required for modes: ${field.requiredForModes.join(', ')}`);
    }
    lines.push(`${field.envKey}=${field.secret ? '' : (field.defaultValue ?? '')}`);
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          fields: MANAGED_CONVERSION_PROVIDER_CONFIG_FIELDS,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(lines.join('\n'));
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  switch (options.command) {
    case 'validate':
      await runValidate(options);
      break;
    case 'readiness':
      await runReadiness(options);
      break;
    case 'sync':
      await runSync(options);
      break;
    case 'list':
    case 'list-destinations':
      await runListDestinations(options);
      break;
    case 'runtime':
      await runRuntime(options);
      break;
    case 'list-decisions':
      await runListDecisions(options);
      break;
    case 'list-outbox':
      await runListOutbox(options);
      break;
    case 'inspect-outbox':
      await runInspectOutbox(options);
      break;
    case 'dry-run-outbox':
      await runDryRunOutbox(options);
      break;
    case 'invoke-worker':
      await runInvokeWorker(options);
      break;
    case 'env-template':
      runEnvTemplate(options);
      break;
    case 'help':
      printHelp();
      break;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
