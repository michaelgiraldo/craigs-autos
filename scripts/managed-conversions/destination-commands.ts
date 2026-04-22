import type { ProviderConversionDestination } from '../../amplify/functions/_lead-platform/domain/conversion-feedback.ts';
import { MANAGED_CONVERSION_PROVIDER_CONFIG_FIELDS } from '../../amplify/functions/_lead-platform/services/conversion-feedback/adapter-registry.ts';
import {
  buildProviderConversionDestinationFromConfig,
  evaluateManagedConversionDestinationConfigReadiness,
} from '../../amplify/functions/_lead-platform/services/provider-conversion-destination-config.ts';
import { loadConfig, loadEnv, printReadiness, printWarnings, readinessFailures } from './config.ts';
import { redactDestination } from './format.ts';
import {
  createDocumentClient,
  getDestination,
  putDestination,
  requireTables,
  resolveRuntime,
  scanDestinations,
} from './runtime.ts';
import type { CliOptions } from './types.ts';

export async function runValidate(options: CliOptions): Promise<void> {
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

export async function runReadiness(options: CliOptions): Promise<void> {
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

export async function runSync(options: CliOptions): Promise<void> {
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

export async function runListDestinations(options: CliOptions): Promise<void> {
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

export function runEnvTemplate(options: CliOptions): void {
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
