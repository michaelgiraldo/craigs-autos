import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  GetFunctionConfigurationCommand,
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
import type { ProviderConversionDestination } from '../../amplify/functions/_lead-platform/domain/conversion-feedback.ts';
import {
  DynamoLeadContactsRepo,
  DynamoLeadConversionDecisionsRepo,
  DynamoLeadConversionFeedbackOutboxRepo,
  DynamoLeadConversionFeedbackOutcomesRepo,
  DynamoLeadRecordsRepo,
  DynamoProviderConversionDestinationsRepo,
} from '../../amplify/functions/_lead-platform/repos/dynamo.ts';
import { loadEnv } from './config.ts';
import {
  defaultListLimit,
  defaultWorkerNameContains,
  enabledPartition,
  tableEnvKeys,
} from './constants.ts';
import type {
  CliOptions,
  ConversionOpsRepos,
  LeadPlatformTableKey,
  RuntimeResolution,
  RuntimeTableConfig,
  WorkerDiscovery,
  WorkerDiscoveryCandidate,
} from './types.ts';

export function applyAwsOptions(options: CliOptions): void {
  if (options.profile) process.env.AWS_PROFILE = options.profile;
}

export function createDocumentClient(options: CliOptions): DynamoDBDocumentClient {
  applyAwsOptions(options);
  return DynamoDBDocumentClient.from(
    new DynamoDBClient({
      ...(options.region ? { region: options.region } : {}),
    }),
  );
}

export function createLambdaClient(options: CliOptions): LambdaClient {
  applyAwsOptions(options);
  return new LambdaClient({
    ...(options.region ? { region: options.region } : {}),
  });
}

export function emptyWorkerDiscovery(args: {
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

export async function discoverWorkerFunction(args: {
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

export async function resolveRuntime(
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

export function requireTables(
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

export function createRepos(args: {
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

export async function getDestination(args: {
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

export async function putDestination(args: {
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

export async function scanTable<T>(args: {
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

export async function scanDestinations(args: {
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
