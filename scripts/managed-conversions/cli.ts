import {
  MANAGED_CONVERSION_FEEDBACK_STATUSES,
  type ManagedConversionFeedbackStatus,
} from '@craigs/contracts/managed-conversion-contract';
import {
  commandNames,
  defaultConfigPath,
  defaultListLimit,
  defaultWorkerNameContains,
} from './constants.ts';
import type { CliOptions, Command } from './types.ts';

export function printHelp(): void {
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

export function parseArgs(argv: string[]): CliOptions {
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
