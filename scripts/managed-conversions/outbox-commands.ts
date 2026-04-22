import { InvokeCommand } from '@aws-sdk/client-lambda';
import type {
  LeadConversionDecision,
  LeadConversionFeedbackOutboxItem,
} from '../../amplify/functions/_lead-platform/domain/conversion-feedback.ts';
import {
  DynamoLeadConversionDecisionsRepo,
  DynamoLeadConversionFeedbackOutboxRepo,
} from '../../amplify/functions/_lead-platform/repos/dynamo.ts';
import type { ManagedConversionFeedbackContext } from '../../amplify/functions/_lead-platform/services/conversion-feedback/adapter-types.ts';
import { MANAGED_CONVERSION_PROVIDER_DEFINITIONS } from '../../amplify/functions/_lead-platform/services/conversion-feedback/provider-catalog.ts';
import type { ManagedConversionProviderDefinition } from '../../amplify/functions/_lead-platform/services/conversion-feedback/provider-definition.ts';
import { tableEnvKeys } from './constants.ts';
import {
  formatDate,
  printDecisionRows,
  printOutboxRows,
  printOutcomeRows,
  redactDestination,
  sortDecisions,
  sortOutboxItems,
  sortOutcomes,
} from './format.ts';
import {
  createDocumentClient,
  createLambdaClient,
  createRepos,
  requireTables,
  resolveRuntime,
  scanTable,
} from './runtime.ts';
import type { CliOptions, LeadPlatformTableKey, OutboxContext } from './types.ts';

export async function runRuntime(options: CliOptions): Promise<void> {
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

export async function runListDecisions(options: CliOptions): Promise<void> {
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

export async function runListOutbox(options: CliOptions): Promise<void> {
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

export async function loadOutboxContext(args: {
  options: CliOptions;
  outboxId: string;
}): Promise<OutboxContext> {
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

export async function runInspectOutbox(options: CliOptions): Promise<void> {
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

export async function runDryRunOutbox(options: CliOptions): Promise<void> {
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

export async function runInvokeWorker(options: CliOptions): Promise<void> {
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
