import process from 'node:process';
import {
  GetFunctionConfigurationCommand,
  LambdaClient,
  ListFunctionsCommand,
  type FunctionConfiguration,
} from '@aws-sdk/client-lambda';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const DEFAULT_REGION = 'us-west-1';
const DEFAULT_FUNCTION_NAME_CONTAINS = 'leadfollowupalertmonitor';

type CliOptions = {
  apply: boolean;
  fromEmail: string | null;
  functionName: string | null;
  functionNameContains: string;
  help: boolean;
  json: boolean;
  profile: string | null;
  region: string;
  recipientEmails: string[] | null;
};

type RuntimeConfig = {
  fromEmail: string;
  functionName: string;
  recipientEmails: string[];
};

type SmokeReport = {
  applied: boolean;
  fromEmail: string;
  functionName: string;
  messageId: string | null;
  recipientEmails: string[];
  region: string;
  subject: string;
};

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    fromEmail: null,
    functionName: null,
    functionNameContains: DEFAULT_FUNCTION_NAME_CONTAINS,
    help: false,
    json: false,
    profile: null,
    region: DEFAULT_REGION,
    recipientEmails: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = (name: string): string => {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error(`${name} requires a value.`);
      }
      index += 1;
      return next;
    };

    if (arg === '--apply') options.apply = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help') options.help = true;
    else if (arg === '--profile') options.profile = readValue('--profile');
    else if (arg.startsWith('--profile=')) options.profile = arg.slice('--profile='.length);
    else if (arg === '--region') options.region = readValue('--region');
    else if (arg.startsWith('--region=')) options.region = arg.slice('--region='.length);
    else if (arg === '--function-name') options.functionName = readValue('--function-name');
    else if (arg.startsWith('--function-name=')) {
      options.functionName = arg.slice('--function-name='.length);
    } else if (arg === '--from-email') {
      options.fromEmail = readValue('--from-email');
    } else if (arg.startsWith('--from-email=')) {
      options.fromEmail = arg.slice('--from-email='.length);
    } else if (arg === '--to-email') {
      options.recipientEmails = parseRecipientList(readValue('--to-email'));
    } else if (arg.startsWith('--to-email=')) {
      options.recipientEmails = parseRecipientList(arg.slice('--to-email='.length));
    } else if (arg === '--function-name-contains') {
      options.functionNameContains = readValue('--function-name-contains');
    } else if (arg.startsWith('--function-name-contains=')) {
      options.functionNameContains = arg.slice('--function-name-contains='.length);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`Lead alert smoke harness

Usage:
  npm run smoke:lead-alerts -- [options]

Options:
  --apply                         Send one test alert email from the configured system sender.
  --profile <name>                AWS profile name.
  --region <name>                 AWS region. Default: ${DEFAULT_REGION}
  --function-name <name>          Explicit lead-followup-alert-monitor Lambda name/ARN.
  --from-email <addr>             Optional sender override when validating before deploy.
  --to-email <addr[,addr...]>     Optional recipient override when validating before deploy.
  --function-name-contains <txt>  Discovery pattern. Default: ${DEFAULT_FUNCTION_NAME_CONTAINS}
  --json                          Print machine-readable JSON output.
  --help                          Show this help.

Examples:
  npm run smoke:lead-alerts -- --profile AdministratorAccess-281934899223
  npm run smoke:lead-alerts -- --profile AdministratorAccess-281934899223 --apply
  npm run smoke:lead-alerts -- --profile AdministratorAccess-281934899223 --apply --from-email system@craigs.autos --to-email alerts@craigs.autos
`);
}

function logLine(json: boolean, label: string, detail: string): void {
  if (json) return;
  process.stdout.write(`${label}: ${detail}\n`);
}

function applyAwsOptions(options: CliOptions): void {
  if (options.profile) process.env.AWS_PROFILE = options.profile;
}

function createLambdaClient(options: CliOptions): LambdaClient {
  applyAwsOptions(options);
  return new LambdaClient({ region: options.region });
}

function createSesClient(options: CliOptions): SESv2Client {
  applyAwsOptions(options);
  return new SESv2Client({ region: options.region });
}

function normalizeDiscoveryText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/gu, '');
}

export function evaluateFunctionCandidate(
  fn: FunctionConfiguration,
  functionNameContains: string,
): string | null {
  const functionName = fn.FunctionName ?? '';
  if (!functionName) return null;
  const normalizedFunctionName = normalizeDiscoveryText(functionName);
  const normalizedNeedle = normalizeDiscoveryText(functionNameContains);
  return normalizedFunctionName.includes(normalizedNeedle) ? functionName : null;
}

async function discoverFunctionName(options: CliOptions): Promise<string> {
  if (options.functionName) return options.functionName;

  const lambda = createLambdaClient(options);
  const matches: string[] = [];
  let marker: string | undefined;

  do {
    const result = await lambda.send(
      new ListFunctionsCommand({
        Marker: marker,
        MaxItems: 50,
      }),
    );
    for (const fn of result.Functions ?? []) {
      const match = evaluateFunctionCandidate(fn, options.functionNameContains);
      if (match) matches.push(match);
    }
    marker = result.NextMarker;
  } while (marker);

  if (!matches.length) {
    throw new Error(
      `Could not find a Lambda matching "${options.functionNameContains}". Use --function-name to specify it directly.`,
    );
  }

  matches.sort((left, right) => left.localeCompare(right));
  return matches[0];
}

function parseRecipientList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function resolveRuntimeConfig(options: CliOptions): Promise<RuntimeConfig> {
  if (options.fromEmail && options.recipientEmails?.length) {
    return {
      fromEmail: options.fromEmail,
      functionName: options.functionName ?? 'local-override',
      recipientEmails: options.recipientEmails,
    };
  }

  const functionName = await discoverFunctionName(options);
  const lambda = createLambdaClient(options);
  const config = await lambda.send(
    new GetFunctionConfigurationCommand({
      FunctionName: functionName,
    }),
  );
  const env = config.Environment?.Variables ?? {};
  const fromEmail = env.LEAD_FAILURE_ALERT_FROM_EMAIL?.trim() ?? '';
  const recipientEmails = parseRecipientList(env.LEAD_FAILURE_ALERT_EMAILS ?? '');

  if (!fromEmail) {
    throw new Error('lead-followup-alert-monitor is missing LEAD_FAILURE_ALERT_FROM_EMAIL.');
  }
  if (!recipientEmails.length) {
    throw new Error('lead-followup-alert-monitor is missing LEAD_FAILURE_ALERT_EMAILS.');
  }

  return {
    fromEmail,
    functionName,
    recipientEmails,
  };
}

async function sendSmokeEmail(args: {
  config: RuntimeConfig;
  options: CliOptions;
  subject: string;
}): Promise<string> {
  const ses = createSesClient(args.options);
  const result = await ses.send(
    new SendEmailCommand({
      FromEmailAddress: args.config.fromEmail,
      Destination: {
        ToAddresses: args.config.recipientEmails,
      },
      Content: {
        Simple: {
          Subject: {
            Charset: 'UTF-8',
            Data: args.subject,
          },
          Body: {
            Html: {
              Charset: 'UTF-8',
              Data: '<p>This is a safe lead alert smoke test. No customer outreach or worker re-drive was triggered.</p>',
            },
            Text: {
              Charset: 'UTF-8',
              Data: 'This is a safe lead alert smoke test. No customer outreach or worker re-drive was triggered.',
            },
          },
        },
      },
    }),
  );

  return result.MessageId ?? '';
}

export async function runLeadAlertSmoke(options: CliOptions): Promise<SmokeReport> {
  const config = await resolveRuntimeConfig(options);
  const subject = `[Lead Alert][TEST] Craig's lead alert smoke`;
  const messageId = options.apply ? await sendSmokeEmail({ config, options, subject }) : null;

  return {
    applied: options.apply,
    fromEmail: config.fromEmail,
    functionName: config.functionName,
    messageId,
    recipientEmails: config.recipientEmails,
    region: options.region,
    subject,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const report = await runLeadAlertSmoke(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  logLine(options.json, 'Function', report.functionName);
  logLine(options.json, 'From', report.fromEmail);
  logLine(options.json, 'To', report.recipientEmails.join(', '));
  logLine(options.json, 'Subject', report.subject);
  logLine(options.json, 'Applied', report.applied ? 'yes' : 'no');
  if (report.messageId) {
    logLine(options.json, 'MessageId', report.messageId);
  }
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/gu, '/'));

if (isDirectRun) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
