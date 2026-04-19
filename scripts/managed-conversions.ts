import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  type ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProviderConversionDestination } from '../amplify/functions/_lead-platform/domain/conversion-feedback.ts';
import {
  buildProviderConversionDestinationFromConfig,
  evaluateManagedConversionDestinationConfigReadiness,
  parseManagedConversionDestinationConfig,
  type DestinationReadiness,
  type ManagedConversionDestinationConfig,
} from '../amplify/functions/_lead-platform/services/provider-conversion-destination-config.ts';
import { MANAGED_CONVERSION_PROVIDER_CONFIG_FIELDS } from '../amplify/functions/_lead-platform/services/conversion-feedback/provider-config-manifest.ts';

type Command = 'validate' | 'readiness' | 'sync' | 'list' | 'env-template' | 'help';

type CliOptions = {
  command: Command;
  configPath: string;
  envFile: string | null;
  tableName: string | null;
  profile: string | null;
  region: string | null;
  apply: boolean;
  allowUnready: boolean;
  json: boolean;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultConfigPath = 'config/managed-conversion-destinations.json';
const enabledPartition = 'enabled';

function printHelp(): void {
  console.log(`Managed conversion operator CLI

Usage:
  npm run managed-conversions -- <command> [options]

Commands:
  validate       Validate config-as-code without AWS access.
  readiness      Validate config and report provider readiness from config + env.
  sync           Dry-run or apply desired destinations to DynamoDB.
  list           List current DynamoDB ProviderConversionDestinations records.
  env-template   Print provider env keys, defaults, and secret markers.

Options:
  --config <path>       Config file. Default: ${defaultConfigPath}
  --env-file <path>     Optional KEY=VALUE file used for readiness checks.
  --table <name>        ProviderConversionDestinations table name.
  --profile <name>      AWS profile name for sync/list.
  --region <name>       AWS region for sync/list.
  --apply               Actually write during sync. Without this, sync is dry-run.
  --allow-unready       Allow sync when an enabled provider is not ready.
  --json                Print machine-readable JSON.
  --help                Show this help.

Examples:
  npm run managed-conversions -- validate
  npm run managed-conversions -- readiness --env-file .env.local
  npm run managed-conversions -- sync --table ProviderTable --profile AdministratorAccess-281934899223
  npm run managed-conversions -- sync --apply --table ProviderTable --profile AdministratorAccess-281934899223
`);
}

function parseArgs(argv: string[]): CliOptions {
  const command = (argv[0] ?? 'help') as Command;
  const options: CliOptions = {
    command,
    configPath: defaultConfigPath,
    envFile: null,
    tableName: null,
    profile: null,
    region: null,
    apply: false,
    allowUnready: false,
    json: false,
  };

  if (!['validate', 'readiness', 'sync', 'list', 'env-template', 'help'].includes(command)) {
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
    else if (arg === '--config') options.configPath = readValue('--config');
    else if (arg.startsWith('--config=')) options.configPath = arg.slice('--config='.length);
    else if (arg === '--env-file') options.envFile = readValue('--env-file');
    else if (arg.startsWith('--env-file=')) options.envFile = arg.slice('--env-file='.length);
    else if (arg === '--table') options.tableName = readValue('--table');
    else if (arg.startsWith('--table=')) options.tableName = arg.slice('--table='.length);
    else if (arg === '--profile') options.profile = readValue('--profile');
    else if (arg.startsWith('--profile=')) options.profile = arg.slice('--profile='.length);
    else if (arg === '--region') options.region = readValue('--region');
    else if (arg.startsWith('--region=')) options.region = arg.slice('--region='.length);
    else throw new Error(`Unknown option: ${arg}`);
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

function createDocumentClient(options: CliOptions): DynamoDBDocumentClient {
  if (options.profile) process.env.AWS_PROFILE = options.profile;
  return DynamoDBDocumentClient.from(
    new DynamoDBClient({
      ...(options.region ? { region: options.region } : {}),
    }),
  );
}

function resolveTableName(options: CliOptions): string {
  const tableName = options.tableName ?? process.env.PROVIDER_CONVERSION_DESTINATIONS_TABLE_NAME;
  if (!tableName) {
    throw new Error(
      'Missing table name. Pass --table or set PROVIDER_CONVERSION_DESTINATIONS_TABLE_NAME.',
    );
  }
  return tableName;
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

async function scanDestinations(args: {
  db: DynamoDBDocumentClient;
  tableName: string;
}): Promise<ProviderConversionDestination[]> {
  const records: ProviderConversionDestination[] = [];
  let ExclusiveStartKey: ScanCommandInput['ExclusiveStartKey'];

  do {
    const result = await args.db.send(
      new ScanCommand({
        TableName: args.tableName,
        ExclusiveStartKey,
      }),
    );
    records.push(...((result.Items as ProviderConversionDestination[] | undefined) ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

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

  const tableName = resolveTableName(options);
  const db = createDocumentClient(options);
  const nowMs = Date.now();
  const planned: ProviderConversionDestination[] = [];

  for (const entry of config.destinations) {
    const existing = await getDestination({
      db,
      tableName,
      destinationKey: entry.destination_key,
    });
    const destination = buildProviderConversionDestinationFromConfig({
      entry,
      nowMs,
      existing,
    });
    planned.push(destination);
    if (options.apply) {
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

async function runList(options: CliOptions): Promise<void> {
  const tableName = resolveTableName(options);
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
      await runList(options);
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
