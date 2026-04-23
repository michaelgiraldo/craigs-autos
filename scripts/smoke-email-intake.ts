import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
  GetFunctionConfigurationCommand,
  LambdaClient,
  ListFunctionsCommand,
  type FunctionConfiguration,
} from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  DeleteObjectCommand,
  GetBucketNotificationConfigurationCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';
import { createLeadSummary } from '../amplify/functions/_lead-platform/domain/lead-summary.ts';
import type {
  CustomerResponsePolicy,
  LeadSummary,
} from '../amplify/functions/_lead-platform/domain/lead-summary.ts';
import type { LeadContactObservation } from '../amplify/functions/_lead-platform/domain/contact-observation.ts';
import type { LeadContactPoint } from '../amplify/functions/_lead-platform/domain/contact-point.ts';
import type { LeadContact } from '../amplify/functions/_lead-platform/domain/contact.ts';
import { createStableLeadFollowupWorkId } from '../amplify/functions/_lead-platform/domain/ids.ts';
import type { Journey } from '../amplify/functions/_lead-platform/domain/journey.ts';
import type { JourneyEvent } from '../amplify/functions/_lead-platform/domain/journey-event.ts';
import type { LeadRecord } from '../amplify/functions/_lead-platform/domain/lead-record.ts';
import type { LeadFollowupWorkItem } from '../amplify/functions/_lead-platform/domain/lead-followup-work.ts';
import type { ProviderReadiness } from '../amplify/functions/_lead-platform/services/providers/provider-contracts.ts';
import {
  buildEmailLeadBundle,
  type EmailLeadIntakeInput,
} from '../amplify/functions/_lead-platform/services/intake-email.ts';
import { upsertLeadBundle } from '../amplify/functions/_lead-platform/services/persist.ts';
import { createDynamoLeadFollowupWorkStore } from '../amplify/functions/lead-followup-worker/followup-work-store.ts';
import { processLeadFollowupWorker } from '../amplify/functions/lead-followup-worker/process-lead-followup-worker.ts';
import type { LeadFollowupWorkerDeps } from '../amplify/functions/lead-followup-worker/types.ts';
import {
  buildEmailMessageLedgerKey,
  buildEmailThreadKey,
} from '../amplify/functions/email-intake-capture/ledger-keys.ts';
import { parseInboundEmail } from '../amplify/functions/email-intake-capture/mime.ts';
import { processEmailIntakeEvent } from '../amplify/functions/email-intake-capture/process-email-intake.ts';
import { createEmailIntakeRuntime } from '../amplify/functions/email-intake-capture/runtime.ts';
import type {
  EmailIntakeConfig,
  EmailLeadEvaluation,
  ParsedInboundEmail,
  PersistEmailLeadInput,
  S3EmailSource,
} from '../amplify/functions/email-intake-capture/types.ts';

const __filename = fileURLToPath(import.meta.url);

const DEFAULT_REGION = 'us-west-1';
const DEFAULT_FUNCTION_NAME_CONTAINS = 'emailintakecapture';
const RAW_PREFIX = 'synthetic-email-intake';
const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 15_000;

const EMAIL_INTAKE_ENV_KEYS = {
  followupWork: 'LEAD_FOLLOWUP_WORK_TABLE_NAME',
  journeyEvents: 'LEAD_JOURNEY_EVENTS_TABLE_NAME',
  journeys: 'LEAD_JOURNEYS_TABLE_NAME',
  leadRecords: 'LEAD_RECORDS_TABLE_NAME',
  contacts: 'LEAD_CONTACTS_TABLE_NAME',
  contactPoints: 'LEAD_CONTACT_POINTS_TABLE_NAME',
  contactObservations: 'LEAD_CONTACT_OBSERVATIONS_TABLE_NAME',
  ledger: 'EMAIL_INTAKE_LEDGER_TABLE_NAME',
} as const;

type CliOptions = {
  apply: boolean;
  bucketName: string | null;
  functionName: string | null;
  functionNameContains: string;
  help: boolean;
  json: boolean;
  keepRecords: boolean;
  profile: string | null;
  region: string;
};

type RuntimeConfig = {
  bucketName: string;
  config: EmailIntakeConfig;
  functionArn: string;
  functionName: string;
  lambdaEnv: Record<string, string>;
  tableNames: Record<keyof typeof EMAIL_INTAKE_ENV_KEYS, string>;
};

type SyntheticScenario = {
  bucketName: string;
  email: ParsedInboundEmail;
  emailContactPointId: string | null;
  evaluation: EmailLeadEvaluation;
  eventSortKey: string;
  followupWorkId: string;
  idempotencyKey: string;
  leadBundleInput: EmailLeadIntakeInput;
  messageId: string;
  messageLedgerKey: string;
  occurredAtMs: number;
  phoneContactPointId: string | null;
  raw: Buffer;
  rawKey: string;
  runId: string;
  source: S3EmailSource;
  threadKey: string;
  threadLedgerKey: string;
};

type IntakeLedgerRow = {
  email_intake_key: string;
  reason?: string;
  status: string;
  updated_at?: number;
};

type CleanupCounts = {
  contactObservations: number;
  contactPoints: number;
  contacts: number;
  followupWork: number;
  journeyEvents: number;
  journeys: number;
  leadRecords: number;
  ledger: number;
  rawEmail: number;
};

type PersistedState = {
  contact: LeadContact;
  emailContactPoint: LeadContactPoint | null;
  event: JourneyEvent;
  followupWork: LeadFollowupWorkItem;
  leadRecord: LeadRecord;
  ledgers: {
    message: IntakeLedgerRow;
    thread: IntakeLedgerRow;
  };
  observations: LeadContactObservation[];
  phoneContactPoint: LeadContactPoint | null;
  journey: Journey;
  rawEmailExists: boolean;
};

type SmokeReport = {
  cleanedUp: boolean;
  cleanupCounts: CleanupCounts;
  functionName: string;
  keptRecords: boolean;
  rawBucket: string;
  records: {
    contactId: string | null;
    followupWorkId: string;
    journeyId: string;
    leadRecordId: string;
    threadKey: string;
  };
  region: string;
  runId: string;
  verified: {
    acceptedLeadPersisted: boolean;
    customerEmailSendStubbed: boolean;
    eventName: string;
    leadNotificationSendStubbed: boolean;
    rawEmailDeleted: boolean;
    workStatus: string;
  };
};

type DryRunPlan = {
  bucketName: string;
  functionName: string;
  plan: SmokeReport['records'];
  region: string;
  runId: string;
};

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    bucketName: null,
    functionName: null,
    functionNameContains: DEFAULT_FUNCTION_NAME_CONTAINS,
    help: false,
    json: false,
    keepRecords: false,
    profile: null,
    region: DEFAULT_REGION,
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
    else if (arg === '--keep-records') options.keepRecords = true;
    else if (arg === '--help') options.help = true;
    else if (arg === '--profile') options.profile = readValue('--profile');
    else if (arg.startsWith('--profile=')) options.profile = arg.slice('--profile='.length);
    else if (arg === '--region') options.region = readValue('--region');
    else if (arg.startsWith('--region=')) options.region = arg.slice('--region='.length);
    else if (arg === '--function-name') options.functionName = readValue('--function-name');
    else if (arg.startsWith('--function-name=')) {
      options.functionName = arg.slice('--function-name='.length);
    } else if (arg === '--function-name-contains') {
      options.functionNameContains = readValue('--function-name-contains');
    } else if (arg.startsWith('--function-name-contains=')) {
      options.functionNameContains = arg.slice('--function-name-contains='.length);
    } else if (arg === '--bucket') {
      options.bucketName = readValue('--bucket');
    } else if (arg.startsWith('--bucket=')) {
      options.bucketName = arg.slice('--bucket='.length);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`Synthetic email intake smoke

Usage:
  npm run smoke:email-intake -- [options]

Options:
  --apply                         Run the live AWS-backed smoke harness.
  --keep-records                  Skip cleanup after a live run.
  --profile <name>                AWS profile name.
  --region <name>                 AWS region. Default: ${DEFAULT_REGION}
  --function-name <name>          Explicit email-intake-capture Lambda name/ARN.
  --function-name-contains <txt>  Discovery pattern. Default: ${DEFAULT_FUNCTION_NAME_CONTAINS}
  --bucket <name>                 Explicit raw email bucket name.
  --json                          Print machine-readable JSON output.
  --help                          Show this help.

Safety:
  This harness uses the live raw-email bucket, ledger table, lead tables, and follow-up table,
  but it does not invoke the deployed worker Lambda. It runs the intake and worker code locally
  with stubbed senders so no real customer or shop email is sent.
`);
}

function logLine(json: boolean, label: string, detail: string): void {
  if (json) return;
  process.stdout.write(`${label}: ${detail}\n`);
}

function createRunId(): string {
  return `${Date.now().toString(36)}${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function applyAwsOptions(options: CliOptions): void {
  if (options.profile) process.env.AWS_PROFILE = options.profile;
  if (options.region) process.env.AWS_REGION = options.region;
}

function createLambdaClient(options: CliOptions): LambdaClient {
  applyAwsOptions(options);
  return new LambdaClient({ region: options.region });
}

function createDocumentClient(options: CliOptions): DynamoDBDocumentClient {
  applyAwsOptions(options);
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: options.region }));
}

function createS3Client(options: CliOptions): S3Client {
  applyAwsOptions(options);
  return new S3Client({ region: options.region });
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

export function lambdaArnMatches(args: {
  candidateArn: string | null | undefined;
  functionArn: string;
  functionName: string;
}): boolean {
  const candidate = args.candidateArn?.trim() ?? '';
  if (!candidate) return false;
  if (candidate === args.functionArn) return true;
  return candidate.endsWith(`:function:${args.functionName}`);
}

async function discoverFunctionConfig(options: CliOptions): Promise<{
  functionArn: string;
  functionName: string;
  lambdaEnv: Record<string, string>;
}> {
  const lambda = createLambdaClient(options);
  let functionName = options.functionName;

  if (!functionName) {
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
        `Could not find a Lambda matching "${options.functionNameContains}". Pass --function-name explicitly.`,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `Multiple Lambdas matched "${options.functionNameContains}": ${matches.join(', ')}. Pass --function-name explicitly.`,
      );
    }
    functionName = matches[0] ?? '';
  }

  const config = await lambda.send(
    new GetFunctionConfigurationCommand({
      FunctionName: functionName,
    }),
  );
  const functionArn = config.FunctionArn?.trim() ?? '';
  if (!functionArn) {
    throw new Error(`Lambda ${functionName} is missing a function ARN.`);
  }

  return {
    functionArn,
    functionName,
    lambdaEnv: Object.fromEntries(
      Object.entries(config.Environment?.Variables ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
      ),
    ),
  };
}

async function discoverRawBucket(args: {
  functionArn: string;
  functionName: string;
  options: CliOptions;
}): Promise<string> {
  if (args.options.bucketName) return args.options.bucketName;

  const s3 = createS3Client(args.options);
  const buckets = await s3.send(new ListBucketsCommand({}));

  for (const bucket of buckets.Buckets ?? []) {
    const name = bucket.Name?.trim();
    if (!name) continue;
    try {
      const notification = await s3.send(
        new GetBucketNotificationConfigurationCommand({
          Bucket: name,
        }),
      );
      const match = (notification.LambdaFunctionConfigurations ?? []).some((config) =>
        lambdaArnMatches({
          candidateArn: config.LambdaFunctionArn,
          functionArn: args.functionArn,
          functionName: args.functionName,
        }),
      );
      if (match) return name;
    } catch {}
  }

  throw new Error(
    `Could not discover the raw email bucket for ${args.functionName}. Pass --bucket explicitly.`,
  );
}

async function resolveRuntimeConfig(options: CliOptions): Promise<RuntimeConfig> {
  const functionConfig = await discoverFunctionConfig(options);
  const bucketName = await discoverRawBucket({
    functionArn: functionConfig.functionArn,
    functionName: functionConfig.functionName,
    options,
  });

  const tableNames = {} as Record<keyof typeof EMAIL_INTAKE_ENV_KEYS, string>;
  for (const [key, envKey] of Object.entries(EMAIL_INTAKE_ENV_KEYS) as Array<
    [
      keyof typeof EMAIL_INTAKE_ENV_KEYS,
      (typeof EMAIL_INTAKE_ENV_KEYS)[keyof typeof EMAIL_INTAKE_ENV_KEYS],
    ]
  >) {
    const value = functionConfig.lambdaEnv[envKey];
    if (!value) {
      throw new Error(
        `Lambda ${functionConfig.functionName} is missing required environment variable ${envKey}.`,
      );
    }
    tableNames[key] = value;
  }

  const runtime = createEmailIntakeRuntime(functionConfig.lambdaEnv as NodeJS.ProcessEnv);
  if (!runtime.configValid || !runtime.repos) {
    throw new Error(
      `Email intake runtime for ${functionConfig.functionName} is not fully configured.`,
    );
  }

  return {
    bucketName,
    config: runtime.config,
    functionArn: functionConfig.functionArn,
    functionName: functionConfig.functionName,
    lambdaEnv: functionConfig.lambdaEnv,
    tableNames,
  };
}

export function buildSyntheticRawEmail(args: {
  config: EmailIntakeConfig;
  customerEmail: string;
  customerName: string;
  messageId: string;
  runId: string;
}): Buffer {
  const subject = `Synthetic email intake smoke ${args.runId}`;
  const body = [
    `This is a synthetic email intake smoke run ${args.runId}.`,
    'Seat bottom repair request for a 1998 BMW M3.',
    'Please delete this record after verification.',
  ].join('\r\n\r\n');

  return Buffer.from(
    [
      `From: ${args.customerName} <${args.customerEmail}>`,
      `To: ${args.config.intakeRecipient}`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: ${args.messageId}`,
      `X-Craigs-Google-Route: ${args.config.googleRouteHeaderValue}`,
      `X-Gm-Original-To: ${args.config.originalRecipient}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body,
    ].join('\r\n'),
    'utf8',
  );
}

function buildSyntheticEvaluation(args: {
  customerEmail: string;
  customerName: string;
  runId: string;
}): EmailLeadEvaluation {
  const projectSummary = `Synthetic email intake smoke project ${args.runId}`;
  const customerPhone = '(408) 555-0173';
  const customerResponsePolicy: CustomerResponsePolicy = 'automatic';
  const leadSummary: LeadSummary = createLeadSummary({
    captureChannel: 'email',
    customerEmail: args.customerEmail,
    customerLanguage: 'en',
    customerMessage: projectSummary,
    customerName: args.customerName,
    customerPhone,
    projectSummary,
    service: 'seat repair',
    vehicle: `Smoke vehicle ${args.runId}`,
    missingInfo: ['photos'],
    customerResponsePolicy,
    customerResponsePolicyReason: 'synthetic_smoke_accepted',
  });

  return {
    aiError: '',
    customerEmail: args.customerEmail,
    customerLanguage: 'en',
    customerName: args.customerName,
    customerPhone,
    isLead: true,
    leadReason: 'synthetic_email_smoke',
    triageDecision: 'accept',
    customerResponsePolicy,
    customerResponsePolicyReason: 'synthetic_smoke_accepted',
    leadSummary,
    missingInfo: ['photos'],
    projectSummary,
    service: 'seat repair',
    vehicle: `Smoke vehicle ${args.runId}`,
  };
}

export async function prepareSyntheticScenario(args: {
  bucketName: string;
  config: EmailIntakeConfig;
  runId: string;
}): Promise<SyntheticScenario> {
  const customerEmail = `smoke-email-intake+${args.runId}@example.com`;
  const customerName = 'Synthetic Email Intake Smoke';
  const messageId = `<smoke-email-intake-${args.runId}@example.com>`;
  const rawKey = `${RAW_PREFIX}/${args.runId}.eml`;
  const raw = buildSyntheticRawEmail({
    config: args.config,
    customerEmail,
    customerName,
    messageId,
    runId: args.runId,
  });
  const source = { bucket: args.bucketName, key: rawKey };
  const email = await parseInboundEmail(raw);
  const evaluation = buildSyntheticEvaluation({
    customerEmail,
    customerName,
    runId: args.runId,
  });
  const occurredAtMs = Date.now();
  const threadKey = buildEmailThreadKey(email);
  const messageLedgerKey = buildEmailMessageLedgerKey(email, source);
  const followupWorkId = createStableLeadFollowupWorkId({
    idempotencyKey: threadKey,
    prefix: 'email',
  });
  const leadBundleInput: EmailLeadIntakeInput = {
    customerLanguage: evaluation.customerLanguage,
    customerMessage: evaluation.projectSummary || email.text,
    email: evaluation.customerEmail,
    emailIntakeId: followupWorkId,
    messageId,
    missingInfo: evaluation.missingInfo,
    leadSummary: evaluation.leadSummary,
    name: evaluation.customerName,
    nameConfidence: 'medium',
    nameSourceMethod: 'ai_extracted',
    occurredAt: occurredAtMs,
    originalRecipient: args.config.originalRecipient,
    phone: evaluation.customerPhone,
    photoAttachmentCount: email.photoAttachments.length,
    projectSummary: evaluation.projectSummary,
    routeStatus: 'google_workspace_route',
    service: evaluation.service,
    siteLabel: args.config.siteLabel,
    subject: email.subject,
    threadKey,
    unsupportedAttachmentCount: email.unsupportedAttachmentCount,
    vehicle: evaluation.vehicle,
  };
  const bundle = buildEmailLeadBundle(leadBundleInput);
  const contactPoints = bundle.contactPoints ?? [];
  const phoneContactPointId =
    contactPoints.find((point) => point.type === 'phone')?.contact_point_id ?? null;
  const emailContactPointId =
    contactPoints.find((point) => point.type === 'email')?.contact_point_id ?? null;

  return {
    bucketName: args.bucketName,
    email,
    emailContactPointId,
    evaluation,
    eventSortKey: bundle.events[0]?.event_sort_key ?? '',
    followupWorkId,
    idempotencyKey: threadKey,
    leadBundleInput,
    messageId,
    messageLedgerKey,
    occurredAtMs,
    phoneContactPointId,
    raw,
    rawKey,
    runId: args.runId,
    source,
    threadKey,
    threadLedgerKey: `thread:${threadKey}`,
  };
}

async function putRawEmail(args: {
  options: CliOptions;
  scenario: SyntheticScenario;
}): Promise<void> {
  const s3 = createS3Client(args.options);
  await s3.send(
    new PutObjectCommand({
      Body: args.scenario.raw,
      Bucket: args.scenario.bucketName,
      ContentType: 'message/rfc822',
      Key: args.scenario.rawKey,
    }),
  );
}

async function rawEmailExists(args: {
  bucketName: string;
  key: string;
  options: CliOptions;
}): Promise<boolean> {
  const s3 = createS3Client(args.options);
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: args.bucketName,
        Key: args.key,
      }),
    );
    return true;
  } catch (error: unknown) {
    const name = (error as { name?: string } | null)?.name;
    const statusCode = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
      ?.httpStatusCode;
    if (name === 'NotFound' || statusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function getItem<T>(args: {
  db: DynamoDBDocumentClient;
  key: Record<string, unknown>;
  tableName: string;
}): Promise<T | null> {
  const result = await args.db.send(
    new GetCommand({
      TableName: args.tableName,
      Key: args.key,
      ConsistentRead: true,
    }),
  );
  return (result.Item as T | undefined) ?? null;
}

async function queryItems<T>(args: {
  db: DynamoDBDocumentClient;
  expressionAttributeValues: Record<string, unknown>;
  keyConditionExpression: string;
  tableName: string;
}): Promise<T[]> {
  const result = await args.db.send(
    new QueryCommand({
      TableName: args.tableName,
      ExpressionAttributeValues: args.expressionAttributeValues,
      KeyConditionExpression: args.keyConditionExpression,
      ConsistentRead: true,
    }),
  );
  return (result.Items as T[] | undefined) ?? [];
}

async function loadPersistedState(args: {
  db: DynamoDBDocumentClient;
  options: CliOptions;
  scenario: SyntheticScenario;
  tableNames: RuntimeConfig['tableNames'];
}): Promise<PersistedState | null> {
  const bundle = buildEmailLeadBundle(args.scenario.leadBundleInput);
  const [journey, leadRecord, contact, event, followupWork, messageLedger, threadLedger] =
    await Promise.all([
      getItem<Journey>({
        db: args.db,
        key: { journey_id: bundle.journey.journey_id },
        tableName: args.tableNames.journeys,
      }),
      getItem<LeadRecord>({
        db: args.db,
        key: { lead_record_id: bundle.leadRecord?.lead_record_id ?? '' },
        tableName: args.tableNames.leadRecords,
      }),
      getItem<LeadContact>({
        db: args.db,
        key: { contact_id: bundle.contact?.contact_id ?? '' },
        tableName: args.tableNames.contacts,
      }),
      getItem<JourneyEvent>({
        db: args.db,
        key: {
          journey_id: bundle.journey.journey_id,
          event_sort_key: args.scenario.eventSortKey,
        },
        tableName: args.tableNames.journeyEvents,
      }),
      getItem<LeadFollowupWorkItem>({
        db: args.db,
        key: { idempotency_key: args.scenario.idempotencyKey },
        tableName: args.tableNames.followupWork,
      }),
      getItem<IntakeLedgerRow>({
        db: args.db,
        key: { email_intake_key: args.scenario.messageLedgerKey },
        tableName: args.tableNames.ledger,
      }),
      getItem<IntakeLedgerRow>({
        db: args.db,
        key: { email_intake_key: args.scenario.threadLedgerKey },
        tableName: args.tableNames.ledger,
      }),
    ]);

  if (
    !journey ||
    !leadRecord ||
    !contact ||
    !event ||
    !followupWork ||
    !messageLedger ||
    !threadLedger
  ) {
    return null;
  }

  const observations = await queryItems<LeadContactObservation>({
    db: args.db,
    expressionAttributeValues: {
      ':contactId': contact.contact_id,
    },
    keyConditionExpression: 'contact_id = :contactId',
    tableName: args.tableNames.contactObservations,
  });

  const phoneContactPoint = args.scenario.phoneContactPointId
    ? await getItem<LeadContactPoint>({
        db: args.db,
        key: { contact_point_id: args.scenario.phoneContactPointId },
        tableName: args.tableNames.contactPoints,
      })
    : null;
  const emailContactPoint = args.scenario.emailContactPointId
    ? await getItem<LeadContactPoint>({
        db: args.db,
        key: { contact_point_id: args.scenario.emailContactPointId },
        tableName: args.tableNames.contactPoints,
      })
    : null;
  const objectExists = await rawEmailExists({
    bucketName: args.scenario.bucketName,
    key: args.scenario.rawKey,
    options: args.options,
  });

  return {
    contact,
    emailContactPoint,
    event,
    followupWork,
    leadRecord,
    ledgers: {
      message: messageLedger,
      thread: threadLedger,
    },
    observations,
    phoneContactPoint,
    journey,
    rawEmailExists: objectExists,
  };
}

async function waitForPersistedState(args: {
  db: DynamoDBDocumentClient;
  options: CliOptions;
  scenario: SyntheticScenario;
  tableNames: RuntimeConfig['tableNames'];
}): Promise<PersistedState> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const state = await loadPersistedState(args);
    if (state) return state;
    await delay(POLL_INTERVAL_MS);
  }

  throw new Error('Timed out waiting for synthetic email intake records.');
}

function assertIntakeState(args: { scenario: SyntheticScenario; state: PersistedState }): void {
  const bundle = buildEmailLeadBundle(args.scenario.leadBundleInput);
  const { state } = args;

  if (state.event.event_name !== LEAD_EVENTS.emailIntakeAccepted) {
    throw new Error(
      `Expected ${LEAD_EVENTS.emailIntakeAccepted}, received ${state.event.event_name}.`,
    );
  }
  if (state.followupWork.capture_channel !== 'email') {
    throw new Error(
      `Expected email follow-up work, received ${state.followupWork.capture_channel}.`,
    );
  }
  if (state.followupWork.status !== 'queued') {
    throw new Error(
      `Expected queued follow-up work after intake, received ${state.followupWork.status}.`,
    );
  }
  if (state.followupWork.followup_work_id !== args.scenario.followupWorkId) {
    throw new Error('Follow-up work id does not match the synthetic email intake id.');
  }
  if (state.followupWork.inbound_email_s3_key !== args.scenario.rawKey) {
    throw new Error('Follow-up work did not retain the synthetic raw email key.');
  }
  if (state.followupWork.source_message_id !== args.scenario.messageId) {
    throw new Error('Follow-up work did not retain the synthetic source message id.');
  }
  if (state.journey.journey_id !== bundle.journey.journey_id) {
    throw new Error('Persisted journey id does not match the expected email bundle.');
  }
  if (state.leadRecord.lead_record_id !== bundle.leadRecord?.lead_record_id) {
    throw new Error('Persisted lead record id does not match the expected email bundle.');
  }
  if (state.contact.contact_id !== bundle.contact?.contact_id) {
    throw new Error('Persisted contact id does not match the expected email bundle.');
  }
  if (state.ledgers.message.status !== 'queued' || state.ledgers.thread.status !== 'queued') {
    throw new Error('Email intake ledger rows were not marked queued.');
  }
  if (!state.rawEmailExists) {
    throw new Error('Accepted intake should leave the raw email object for worker cleanup.');
  }
}

function createSmokeWorkerDeps(args: {
  db: DynamoDBDocumentClient;
  options: CliOptions;
  scenario: SyntheticScenario;
  tableName: string;
}): LeadFollowupWorkerDeps {
  const store = createDynamoLeadFollowupWorkStore({
    db: args.db,
    tableName: args.tableName,
  });
  const s3 = createS3Client(args.options);
  const smsProviderReadiness: ProviderReadiness = {
    capability: 'sms_delivery',
    enabled: false,
    issues: [],
    message: 'disabled for synthetic smoke',
    provider: 'quo',
    ready: false,
  };

  return {
    ...store,
    configValid: true,
    createLeaseId: () => `smoke-lease-${args.scenario.runId}`,
    smsProviderReadiness,
    nowEpochSeconds: () => Math.floor(Date.now() / 1000),
    generateDrafts: async () => ({
      aiError: '',
      aiModel: 'smoke-email-intake-local',
      aiStatus: 'fallback',
      drafts: {
        emailBody: `Synthetic email intake smoke response ${args.scenario.runId}`,
        emailSubject: `Synthetic email intake smoke ${args.scenario.runId}`,
        missingInfo: ['photos'],
        smsBody: `Synthetic email intake smoke ${args.scenario.runId}`,
      },
    }),
    sendSms: async () => ({ id: `smoke-sms-${args.scenario.runId}`, status: 'skipped' }),
    sendCustomerEmail: async () => ({
      messageId: `smoke-customer-email-${args.scenario.runId}`,
    }),
    sendLeadNotificationEmail: async () => ({
      messageId: `smoke-lead-notification-${args.scenario.runId}`,
    }),
    cleanupInboundEmailSource: async (record) => {
      if (!record.inbound_email_s3_bucket || !record.inbound_email_s3_key) return;
      await s3.send(
        new DeleteObjectCommand({
          Bucket: record.inbound_email_s3_bucket,
          Key: record.inbound_email_s3_key,
        }),
      );
    },
    cleanupLeadAttachments: async () => undefined,
    syncLeadRecord: async () => undefined,
  };
}

async function runWorkerLocally(args: {
  db: DynamoDBDocumentClient;
  options: CliOptions;
  scenario: SyntheticScenario;
  tableName: string;
}): Promise<LeadFollowupWorkItem> {
  const outcome = await processLeadFollowupWorker({
    deps: createSmokeWorkerDeps(args),
    idempotencyKey: args.scenario.idempotencyKey,
  });

  if (outcome.statusCode !== 200 || outcome.body.ok !== true) {
    throw new Error(`Synthetic worker run failed: ${JSON.stringify(outcome.body)}`);
  }

  const followupWork = await getItem<LeadFollowupWorkItem>({
    db: args.db,
    key: { idempotency_key: args.scenario.idempotencyKey },
    tableName: args.tableName,
  });
  if (!followupWork) {
    throw new Error('Synthetic follow-up work disappeared before verification.');
  }

  if (followupWork.status !== 'completed') {
    throw new Error(`Expected completed follow-up work, received ${followupWork.status}.`);
  }
  if (followupWork.email_status !== 'sent') {
    throw new Error(`Expected sent customer email status, received ${followupWork.email_status}.`);
  }
  if (followupWork.lead_notification_status !== 'sent') {
    throw new Error(
      `Expected sent lead notification status, received ${followupWork.lead_notification_status}.`,
    );
  }
  if (followupWork.outreach_result !== 'email_sent') {
    throw new Error(
      `Expected outreach_result=email_sent, received ${followupWork.outreach_result}.`,
    );
  }

  const objectExists = await rawEmailExists({
    bucketName: args.scenario.bucketName,
    key: args.scenario.rawKey,
    options: args.options,
  });
  if (objectExists) {
    throw new Error('Synthetic raw email object still exists after local worker cleanup.');
  }

  return followupWork;
}

function createEmptyCleanupCounts(): CleanupCounts {
  return {
    contactObservations: 0,
    contactPoints: 0,
    contacts: 0,
    followupWork: 0,
    journeyEvents: 0,
    journeys: 0,
    leadRecords: 0,
    ledger: 0,
    rawEmail: 0,
  };
}

function isSyntheticObservation(args: {
  observation: LeadContactObservation;
  scenario: SyntheticScenario;
}): boolean {
  return (
    args.observation.source_event_id === args.scenario.messageId &&
    (args.observation.observed_value === args.scenario.evaluation.customerName ||
      args.observation.observed_value === args.scenario.evaluation.customerEmail ||
      args.observation.observed_value === args.scenario.evaluation.customerPhone ||
      args.observation.normalized_value === args.scenario.evaluation.customerEmail?.toLowerCase())
  );
}

async function cleanupSyntheticRecords(args: {
  db: DynamoDBDocumentClient;
  options: CliOptions;
  scenario: SyntheticScenario;
  tableNames: RuntimeConfig['tableNames'];
}): Promise<CleanupCounts> {
  const counts = createEmptyCleanupCounts();
  const bundle = buildEmailLeadBundle(args.scenario.leadBundleInput);
  const contactId = bundle.contact?.contact_id;
  const journeyId = bundle.journey.journey_id;
  const leadRecordId = bundle.leadRecord?.lead_record_id ?? null;

  const [observations, rawExists] = await Promise.all([
    contactId
      ? queryItems<LeadContactObservation>({
          db: args.db,
          expressionAttributeValues: {
            ':contactId': contactId,
          },
          keyConditionExpression: 'contact_id = :contactId',
          tableName: args.tableNames.contactObservations,
        })
      : Promise.resolve([]),
    rawEmailExists({
      bucketName: args.scenario.bucketName,
      key: args.scenario.rawKey,
      options: args.options,
    }),
  ]);

  if (rawExists) {
    await createS3Client(args.options).send(
      new DeleteObjectCommand({
        Bucket: args.scenario.bucketName,
        Key: args.scenario.rawKey,
      }),
    );
    counts.rawEmail += 1;
  }

  for (const ledgerKey of [args.scenario.messageLedgerKey, args.scenario.threadLedgerKey]) {
    const row = await getItem<IntakeLedgerRow>({
      db: args.db,
      key: { email_intake_key: ledgerKey },
      tableName: args.tableNames.ledger,
    });
    if (!row) continue;
    await args.db.send(
      new DeleteCommand({
        TableName: args.tableNames.ledger,
        Key: { email_intake_key: ledgerKey },
      }),
    );
    counts.ledger += 1;
  }

  const followupWork = await getItem<LeadFollowupWorkItem>({
    db: args.db,
    key: { idempotency_key: args.scenario.idempotencyKey },
    tableName: args.tableNames.followupWork,
  });
  if (followupWork?.followup_work_id === args.scenario.followupWorkId) {
    await args.db.send(
      new DeleteCommand({
        TableName: args.tableNames.followupWork,
        Key: { idempotency_key: args.scenario.idempotencyKey },
      }),
    );
    counts.followupWork += 1;
  }

  const event = await getItem<JourneyEvent>({
    db: args.db,
    key: {
      journey_id: journeyId,
      event_sort_key: args.scenario.eventSortKey,
    },
    tableName: args.tableNames.journeyEvents,
  });
  if (event?.event_name === LEAD_EVENTS.emailIntakeAccepted) {
    await args.db.send(
      new DeleteCommand({
        TableName: args.tableNames.journeyEvents,
        Key: {
          journey_id: journeyId,
          event_sort_key: args.scenario.eventSortKey,
        },
      }),
    );
    counts.journeyEvents += 1;
  }

  for (const observation of observations.filter((item) =>
    isSyntheticObservation({ observation: item, scenario: args.scenario }),
  )) {
    await args.db.send(
      new DeleteCommand({
        TableName: args.tableNames.contactObservations,
        Key: {
          contact_id: observation.contact_id,
          observation_sort_key: observation.observation_sort_key,
        },
      }),
    );
    counts.contactObservations += 1;
  }

  for (const contactPointId of [
    args.scenario.phoneContactPointId,
    args.scenario.emailContactPointId,
  ]) {
    if (!contactPointId) continue;
    const contactPoint = await getItem<LeadContactPoint>({
      db: args.db,
      key: { contact_point_id: contactPointId },
      tableName: args.tableNames.contactPoints,
    });
    if (!contactPoint || contactPoint.source_event_id !== args.scenario.messageId) continue;
    await args.db.send(
      new DeleteCommand({
        TableName: args.tableNames.contactPoints,
        Key: { contact_point_id: contactPointId },
      }),
    );
    counts.contactPoints += 1;
  }

  if (leadRecordId) {
    const leadRecord = await getItem<LeadRecord>({
      db: args.db,
      key: { lead_record_id: leadRecordId },
      tableName: args.tableNames.leadRecords,
    });
    if (leadRecord?.journey_id === journeyId) {
      await args.db.send(
        new DeleteCommand({
          TableName: args.tableNames.leadRecords,
          Key: { lead_record_id: leadRecordId },
        }),
      );
      counts.leadRecords += 1;
    }
  }

  const journey = await getItem<Journey>({
    db: args.db,
    key: { journey_id: journeyId },
    tableName: args.tableNames.journeys,
  });
  if (journey?.thread_id === args.scenario.threadKey) {
    await args.db.send(
      new DeleteCommand({
        TableName: args.tableNames.journeys,
        Key: { journey_id: journeyId },
      }),
    );
    counts.journeys += 1;
  }

  if (contactId) {
    const contact = await getItem<LeadContact>({
      db: args.db,
      key: { contact_id: contactId },
      tableName: args.tableNames.contacts,
    });
    if (contact?.raw_email === args.scenario.evaluation.customerEmail) {
      await args.db.send(
        new DeleteCommand({
          TableName: args.tableNames.contacts,
          Key: { contact_id: contactId },
        }),
      );
      counts.contacts += 1;
    }
  }

  return counts;
}

async function run(options: CliOptions): Promise<SmokeReport | DryRunPlan> {
  const runtime = await resolveRuntimeConfig(options);
  const scenario = await prepareSyntheticScenario({
    bucketName: runtime.bucketName,
    config: runtime.config,
    runId: createRunId(),
  });
  const bundle = buildEmailLeadBundle(scenario.leadBundleInput);

  if (!options.apply) {
    return {
      bucketName: runtime.bucketName,
      functionName: runtime.functionName,
      plan: {
        contactId: bundle.contact?.contact_id ?? null,
        followupWorkId: scenario.followupWorkId,
        journeyId: bundle.journey.journey_id,
        leadRecordId: bundle.leadRecord?.lead_record_id ?? '',
        threadKey: scenario.threadKey,
      },
      region: options.region,
      runId: scenario.runId,
    };
  }

  const db = createDocumentClient(options);
  let cleanupCounts = createEmptyCleanupCounts();
  let cleanedUp = false;

  try {
    await putRawEmail({ options, scenario });

    const baseRuntime = createEmailIntakeRuntime(runtime.lambdaEnv as NodeJS.ProcessEnv);
    if (!baseRuntime.configValid || !baseRuntime.repos) {
      throw new Error('Resolved email intake runtime is not configured for live AWS use.');
    }

    const deterministicPersist = async (input: PersistEmailLeadInput) => {
      const persistedBundle = buildEmailLeadBundle({
        customerLanguage: input.customerLanguage,
        customerMessage: input.customerMessage,
        email: input.customerEmail,
        emailIntakeId: input.emailIntakeId,
        messageId: input.messageId,
        missingInfo: input.missingInfo,
        leadSummary: input.leadSummary,
        name: input.customerName,
        nameConfidence: input.customerNameConfidence,
        nameSourceMethod: input.customerNameSourceMethod,
        occurredAt: scenario.occurredAtMs,
        originalRecipient: input.originalRecipient,
        phone: input.customerPhone,
        photoAttachmentCount: input.photoAttachmentCount,
        projectSummary: input.projectSummary,
        routeStatus: input.routeStatus,
        service: input.service,
        siteLabel: baseRuntime.config.siteLabel,
        subject: input.subject,
        threadKey: input.threadKey,
        unsupportedAttachmentCount: input.unsupportedAttachmentCount,
        vehicle: input.vehicle,
      });
      if (!baseRuntime.repos) {
        throw new Error('Email smoke runtime is missing lead platform repositories.');
      }
      const persisted = await upsertLeadBundle(baseRuntime.repos, persistedBundle);
      return {
        contactId: persisted.contact?.contact_id ?? null,
        journeyId: persisted.journey.journey_id,
        leadRecordId: persisted.leadRecord?.lead_record_id ?? null,
      };
    };

    await processEmailIntakeEvent(
      {
        Records: [
          {
            s3: {
              bucket: { name: scenario.source.bucket },
              object: { key: encodeURIComponent(scenario.source.key) },
            },
          },
        ],
      },
      {
        ...baseRuntime,
        evaluateLead: async () => scenario.evaluation,
        invokeFollowup: async () => undefined,
        nowEpochSeconds: () => Math.floor(scenario.occurredAtMs / 1000),
        persistEmailLead: deterministicPersist,
      },
    );

    const state = await waitForPersistedState({
      db,
      options,
      scenario,
      tableNames: runtime.tableNames,
    });
    assertIntakeState({ scenario, state });

    const completedWork = await runWorkerLocally({
      db,
      options,
      scenario,
      tableName: runtime.tableNames.followupWork,
    });

    if (!options.keepRecords) {
      cleanupCounts = await cleanupSyntheticRecords({
        db,
        options,
        scenario,
        tableNames: runtime.tableNames,
      });
      cleanedUp = true;
    }

    return {
      cleanedUp,
      cleanupCounts,
      functionName: runtime.functionName,
      keptRecords: options.keepRecords,
      rawBucket: runtime.bucketName,
      records: {
        contactId: bundle.contact?.contact_id ?? null,
        followupWorkId: scenario.followupWorkId,
        journeyId: bundle.journey.journey_id,
        leadRecordId: bundle.leadRecord?.lead_record_id ?? '',
        threadKey: scenario.threadKey,
      },
      region: options.region,
      runId: scenario.runId,
      verified: {
        acceptedLeadPersisted: true,
        customerEmailSendStubbed:
          completedWork.customer_email_message_id === `smoke-customer-email-${scenario.runId}`,
        eventName: state.event.event_name,
        leadNotificationSendStubbed:
          completedWork.lead_notification_message_id ===
          `smoke-lead-notification-${scenario.runId}`,
        rawEmailDeleted: true,
        workStatus: completedWork.status,
      },
    };
  } catch (error: unknown) {
    if (!options.keepRecords) {
      try {
        cleanupCounts = await cleanupSyntheticRecords({
          db,
          options,
          scenario,
          tableNames: runtime.tableNames,
        });
        cleanedUp = true;
      } catch (cleanupError: unknown) {
        const cleanupMessage =
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        const originalMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`${originalMessage}\nCleanup also failed: ${cleanupMessage}`);
      }
    }
    throw error;
  }
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }

    const result = await run(options);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    if ('verified' in result) {
      logLine(options.json, 'Function', result.functionName);
      logLine(options.json, 'Bucket', result.rawBucket);
      logLine(options.json, 'Region', result.region);
      logLine(options.json, 'Run', result.runId);
      logLine(options.json, 'ThreadKey', result.records.threadKey);
      logLine(options.json, 'FollowupWork', result.records.followupWorkId);
      logLine(options.json, 'Journey', result.records.journeyId);
      logLine(options.json, 'LeadRecord', result.records.leadRecordId);
      logLine(options.json, 'Event', result.verified.eventName);
      logLine(options.json, 'WorkStatus', result.verified.workStatus);
      logLine(
        options.json,
        'Cleanup',
        result.keptRecords
          ? 'kept synthetic records by request'
          : `deleted ${result.cleanupCounts.ledger} ledger rows, ${result.cleanupCounts.followupWork} follow-up work item, ${result.cleanupCounts.journeyEvents} event, ${result.cleanupCounts.contactObservations} observations, ${result.cleanupCounts.contactPoints} contact points, ${result.cleanupCounts.leadRecords} lead record, ${result.cleanupCounts.journeys} journey, ${result.cleanupCounts.contacts} contact`,
      );
      return;
    }

    logLine(options.json, 'Function', result.functionName);
    logLine(options.json, 'Bucket', result.bucketName);
    logLine(options.json, 'Region', result.region);
    logLine(options.json, 'Run', result.runId);
    logLine(options.json, 'Plan', 'resolved runtime and synthetic ids; pass --apply to execute');
    logLine(options.json, 'ThreadKey', result.plan.threadKey);
    logLine(options.json, 'FollowupWork', result.plan.followupWorkId);
    logLine(options.json, 'Journey', result.plan.journeyId);
    logLine(options.json, 'LeadRecord', result.plan.leadRecordId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] || '') === __filename) {
  await main();
}
