import { parseArgs, printHelp } from './managed-conversions/cli.ts';
import {
  runEnvTemplate,
  runListDestinations,
  runReadiness,
  runSync,
  runValidate,
} from './managed-conversions/destination-commands.ts';
import {
  runDryRunOutbox,
  runInspectOutbox,
  runInvokeWorker,
  runListDecisions,
  runListOutbox,
  runRuntime,
} from './managed-conversions/outbox-commands.ts';

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
