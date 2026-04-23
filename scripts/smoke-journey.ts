import { randomUUID } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  GetFunctionConfigurationCommand,
  InvokeCommand,
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
import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';
import type { LeadContactObservation } from '../amplify/functions/_lead-platform/domain/contact-observation.ts';
import type { LeadContactPoint } from '../amplify/functions/_lead-platform/domain/contact-point.ts';
import type { LeadContact } from '../amplify/functions/_lead-platform/domain/contact.ts';
import {
  createClientJourneyEventSortKey,
  createStableLeadContactId,
  createStableLeadContactPointId,
  createStableLeadFollowupWorkId,
  createStableLeadRecordId,
} from '../amplify/functions/_lead-platform/domain/ids.ts';
import type { Journey } from '../amplify/functions/_lead-platform/domain/journey.ts';
import type { JourneyEvent } from '../amplify/functions/_lead-platform/domain/journey-event.ts';
import type { LeadRecord } from '../amplify/functions/_lead-platform/domain/lead-record.ts';
import {
  normalizeEmail,
  normalizePhoneE164,
} from '../amplify/functions/_lead-platform/domain/normalize.ts';
import type { LeadFollowupWorkItem } from '../amplify/functions/_lead-platform/domain/lead-followup-work.ts';

const __filename = fileURLToPath(import.meta.url);

const DEFAULT_REGION = 'us-west-1';
const DEFAULT_FUNCTION_NAME_CONTAINS = 'quoterequestsubmit';
const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 15_000;

const TABLE_ENV_KEYS = {
  contactObservations: 'LEAD_CONTACT_OBSERVATIONS_TABLE_NAME',
  contactPoints: 'LEAD_CONTACT_POINTS_TABLE_NAME',
  contacts: 'LEAD_CONTACTS_TABLE_NAME',
  followupWork: 'LEAD_FOLLOWUP_WORK_TABLE_NAME',
  journeyEvents: 'LEAD_JOURNEY_EVENTS_TABLE_NAME',
  journeys: 'LEAD_JOURNEYS_TABLE_NAME',
  leadRecords: 'LEAD_RECORDS_TABLE_NAME',
} as const;

type CliOptions = {
  apply: boolean;
  functionName: string | null;
  functionNameContains: string;
  help: boolean;
  json: boolean;
  keepRecords: boolean;
  profile: string | null;
  region: string;
};

type RuntimeConfig = {
  functionName: string;
  tableNames: Record<keyof typeof TABLE_ENV_KEYS, string>;
};

type SmokeRequest = {
  __smoke_test: true;
  client_event_id: string;
  email: string;
  headers: {
    origin: string;
  };
  journey_id: string;
  locale: string;
  message: string;
  name: string;
  pageUrl: string;
  phone: string;
  service: string;
  user: string;
  vehicle: string;
};

type ExpectedIdentifiers = {
  clientEventId: string;
  contactId: string;
  emailContactPointId: string;
  eventSortKey: string;
  followupWorkId: string;
  idempotencyKey: string;
  journeyId: string;
  leadRecordId: string;
  normalizedEmail: string;
  normalizedPhone: string;
  phoneContactPointId: string;
};

type PersistedBundle = {
  contact: LeadContact;
  emailContactPoint: LeadContactPoint;
  event: JourneyEvent;
  followupWork: LeadFollowupWorkItem | null;
  journey: Journey;
  leadRecord: LeadRecord;
  observations: LeadContactObservation[];
  phoneContactPoint: LeadContactPoint;
};

type CleanupCounts = {
  contacts: number;
  contactObservations: number;
  contactPoints: number;
  followupWork: number;
  journeyEvents: number;
  journeys: number;
  leadRecords: number;
};

type SmokeReport = {
  cleanedUp: boolean;
  cleanupCounts: CleanupCounts;
  functionName: string;
  keptRecords: boolean;
  records: {
    contactId: string;
    followupWorkCreated: boolean;
    journeyId: string;
    leadRecordId: string;
  };
  region: string;
  runId: string;
  verified: {
    contactObservations: number;
    customerAction: string | null;
    eventName: string;
    leadStatus: string;
    noFollowupWorkQueued: boolean;
  };
};

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
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
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`Journey smoke harness

Usage:
  npm run smoke:journey -- [options]

Options:
  --apply                         Invoke the live Lambda, verify Dynamo writes, and clean up.
  --keep-records                  Skip cleanup after a live run.
  --profile <name>                AWS profile name.
  --region <name>                 AWS region. Default: ${DEFAULT_REGION}
  --function-name <name>          Explicit quote-request-submit Lambda name/ARN.
  --function-name-contains <txt>  Discovery pattern. Default: ${DEFAULT_FUNCTION_NAME_CONTAINS}
  --json                          Print machine-readable JSON output.
  --help                          Show this help.

Examples:
  npm run smoke:journey -- --profile AdministratorAccess-281934899223
  npm run smoke:journey -- --profile AdministratorAccess-281934899223 --apply
  npm run smoke:journey -- --profile AdministratorAccess-281934899223 --apply --keep-records
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

function createDocumentClient(options: CliOptions): DynamoDBDocumentClient {
  applyAwsOptions(options);
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: options.region }));
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
      `Could not find a Lambda matching "${options.functionNameContains}". Pass --function-name explicitly.`,
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `Multiple Lambdas matched "${options.functionNameContains}": ${matches.join(', ')}. Pass --function-name explicitly.`,
    );
  }

  return matches[0] ?? '';
}

async function resolveRuntimeConfig(options: CliOptions): Promise<RuntimeConfig> {
  const functionName = await discoverFunctionName(options);
  const lambda = createLambdaClient(options);
  const config = await lambda.send(
    new GetFunctionConfigurationCommand({
      FunctionName: functionName,
    }),
  );
  const env = config.Environment?.Variables ?? {};

  const tableNames = {} as Record<keyof typeof TABLE_ENV_KEYS, string>;
  for (const [key, envKey] of Object.entries(TABLE_ENV_KEYS) as Array<
    [keyof typeof TABLE_ENV_KEYS, (typeof TABLE_ENV_KEYS)[keyof typeof TABLE_ENV_KEYS]]
  >) {
    const value = env[envKey];
    if (!value) {
      throw new Error(`Lambda ${functionName} is missing required environment variable ${envKey}.`);
    }
    tableNames[key] = value;
  }

  return { functionName, tableNames };
}

function createRunId(): string {
  return `${Date.now().toString(36)}${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function buildSyntheticPhone(runId: string): string {
  const digits = runId.replace(/[^\d]/g, '').padEnd(4, '0').slice(-4);
  return `(408) 555-${digits}`;
}

export function buildSyntheticSmokeRequest(runId: string): SmokeRequest {
  return {
    __smoke_test: true,
    client_event_id: `journey-smoke-${runId}`,
    email: `journey-smoke+${runId}@example.com`,
    headers: {
      origin: 'https://craigs.autos',
    },
    journey_id: `journey_smoke_${runId}`,
    locale: 'en',
    message: `Synthetic journey smoke run ${runId}. Delete after verification.`,
    name: 'Journey Smoke Test',
    pageUrl: `https://craigs.autos/en/request-a-quote?journey_smoke=${runId}`,
    phone: buildSyntheticPhone(runId),
    service: 'seat-repair',
    user: `journey-smoke-user-${runId}`,
    vehicle: `Journey smoke vehicle ${runId}`,
  };
}

export function buildExpectedIdentifiers(request: SmokeRequest): ExpectedIdentifiers {
  const normalizedEmail = normalizeEmail(request.email);
  const normalizedPhone = normalizePhoneE164(request.phone);
  if (!normalizedEmail || !normalizedPhone) {
    throw new Error('Synthetic smoke request must include a normalizable email and phone.');
  }

  const journeyId = request.journey_id;
  const leadRecordId = createStableLeadRecordId({
    sourceKind: 'journey',
    sourceValue: journeyId,
  });
  const contactId = createStableLeadContactId({
    normalizedEmail,
    normalizedPhone,
  });
  const idempotencyKey = `form:${request.client_event_id}`;
  const followupWorkId = createStableLeadFollowupWorkId({
    idempotencyKey,
    prefix: 'form',
  });

  return {
    clientEventId: request.client_event_id,
    contactId,
    emailContactPointId: createStableLeadContactPointId({
      type: 'email',
      normalizedValue: normalizedEmail,
    }),
    eventSortKey: createClientJourneyEventSortKey({
      journeyId,
      clientEventId: request.client_event_id,
    }),
    followupWorkId,
    idempotencyKey,
    journeyId,
    leadRecordId,
    normalizedEmail,
    normalizedPhone,
    phoneContactPointId: createStableLeadContactPointId({
      type: 'phone',
      normalizedValue: normalizedPhone,
    }),
  };
}

function decodePayload(payload: Uint8Array | undefined): string {
  return payload ? Buffer.from(payload).toString('utf8') : '';
}

async function invokeSmokeRequest(args: {
  functionName: string;
  options: CliOptions;
  request: SmokeRequest;
}): Promise<{ journeyId: string; leadRecordId: string }> {
  const lambda = createLambdaClient(args.options);
  const response = await lambda.send(
    new InvokeCommand({
      FunctionName: args.functionName,
      Payload: Buffer.from(JSON.stringify(args.request)),
    }),
  );

  if (response.FunctionError) {
    throw new Error(
      `Lambda invocation failed with ${response.FunctionError}: ${decodePayload(response.Payload)}`,
    );
  }

  const payloadText = decodePayload(response.Payload);
  const parsedPayload =
    payloadText.trim().length > 0
      ? (JSON.parse(payloadText) as { body?: string; statusCode?: number })
      : {};
  const statusCode = parsedPayload.statusCode ?? 0;
  const body =
    typeof parsedPayload.body === 'string' && parsedPayload.body.trim()
      ? JSON.parse(parsedPayload.body)
      : {};

  if (statusCode !== 200 || body?.smoke_test !== true) {
    throw new Error(`Unexpected smoke response: ${payloadText || '<empty>'}`);
  }

  const journeyId = typeof body.journey_id === 'string' ? body.journey_id : null;
  const leadRecordId = typeof body.lead_record_id === 'string' ? body.lead_record_id : null;
  if (!journeyId || !leadRecordId) {
    throw new Error(`Smoke response is missing durable ids: ${payloadText || '<empty>'}`);
  }

  return { journeyId, leadRecordId };
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
  keyConditionExpression: string;
  expressionAttributeValues: Record<string, unknown>;
  tableName: string;
}): Promise<T[]> {
  const result = await args.db.send(
    new QueryCommand({
      TableName: args.tableName,
      KeyConditionExpression: args.keyConditionExpression,
      ExpressionAttributeValues: args.expressionAttributeValues,
      ConsistentRead: true,
    }),
  );
  return (result.Items as T[] | undefined) ?? [];
}

async function loadPersistedBundle(args: {
  db: DynamoDBDocumentClient;
  expected: ExpectedIdentifiers;
  tableNames: RuntimeConfig['tableNames'];
}): Promise<PersistedBundle | null> {
  const { db, expected, tableNames } = args;
  const [journey, leadRecord, contact, event, phoneContactPoint, emailContactPoint, followupWork] =
    await Promise.all([
      getItem<Journey>({
        db,
        key: { journey_id: expected.journeyId },
        tableName: tableNames.journeys,
      }),
      getItem<LeadRecord>({
        db,
        key: { lead_record_id: expected.leadRecordId },
        tableName: tableNames.leadRecords,
      }),
      getItem<LeadContact>({
        db,
        key: { contact_id: expected.contactId },
        tableName: tableNames.contacts,
      }),
      getItem<JourneyEvent>({
        db,
        key: {
          journey_id: expected.journeyId,
          event_sort_key: expected.eventSortKey,
        },
        tableName: tableNames.journeyEvents,
      }),
      getItem<LeadContactPoint>({
        db,
        key: { contact_point_id: expected.phoneContactPointId },
        tableName: tableNames.contactPoints,
      }),
      getItem<LeadContactPoint>({
        db,
        key: { contact_point_id: expected.emailContactPointId },
        tableName: tableNames.contactPoints,
      }),
      getItem<LeadFollowupWorkItem>({
        db,
        key: { idempotency_key: expected.idempotencyKey },
        tableName: tableNames.followupWork,
      }),
    ]);

  if (!journey || !leadRecord || !contact || !event || !phoneContactPoint || !emailContactPoint) {
    return null;
  }

  const observations = await queryItems<LeadContactObservation>({
    db,
    keyConditionExpression: 'contact_id = :contactId',
    expressionAttributeValues: {
      ':contactId': expected.contactId,
    },
    tableName: tableNames.contactObservations,
  });

  if (observations.length < 3) {
    return null;
  }

  return {
    contact,
    emailContactPoint,
    event,
    followupWork,
    journey,
    leadRecord,
    observations,
    phoneContactPoint,
  };
}

async function waitForPersistedBundle(args: {
  db: DynamoDBDocumentClient;
  expected: ExpectedIdentifiers;
  options: CliOptions;
  tableNames: RuntimeConfig['tableNames'];
}): Promise<PersistedBundle> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastError = 'Timed out waiting for persisted journey smoke records.';

  while (Date.now() < deadline) {
    const bundle = await loadPersistedBundle(args);
    if (bundle) return bundle;
    lastError = 'Journey/contact/lead records are not all visible yet.';
    await delay(POLL_INTERVAL_MS);
  }

  throw new Error(lastError);
}

function assertBundleMatchesSyntheticRequest(args: {
  bundle: PersistedBundle;
  expected: ExpectedIdentifiers;
  request: SmokeRequest;
}): void {
  const { bundle, expected, request } = args;

  if (bundle.journey.capture_channel !== 'form') {
    throw new Error(`Expected form journey capture, received ${bundle.journey.capture_channel}.`);
  }
  if (bundle.journey.lead_record_id !== expected.leadRecordId) {
    throw new Error('Persisted journey did not link to the expected lead record.');
  }
  if (bundle.journey.contact_id !== expected.contactId) {
    throw new Error('Persisted journey did not link to the expected contact.');
  }
  if (bundle.journey.page_url !== request.pageUrl) {
    throw new Error('Persisted journey page URL does not match the smoke request.');
  }

  if (bundle.leadRecord.journey_id !== expected.journeyId) {
    throw new Error('Lead record did not link back to the synthetic journey.');
  }
  if (bundle.leadRecord.contact_id !== expected.contactId) {
    throw new Error('Lead record did not link back to the synthetic contact.');
  }
  if (bundle.leadRecord.customer_message !== request.message) {
    throw new Error('Lead record customer message does not match the smoke request.');
  }

  if (bundle.contact.normalized_email !== expected.normalizedEmail) {
    throw new Error('Contact normalized email does not match the synthetic email.');
  }
  if (bundle.contact.normalized_phone !== expected.normalizedPhone) {
    throw new Error('Contact normalized phone does not match the synthetic phone.');
  }

  if (bundle.event.event_name !== LEAD_EVENTS.formSubmitSuccess) {
    throw new Error(
      `Expected ${LEAD_EVENTS.formSubmitSuccess}, received ${bundle.event.event_name}.`,
    );
  }
  if (bundle.event.client_event_id !== expected.clientEventId) {
    throw new Error('Journey event client_event_id does not match the smoke request.');
  }
  if (bundle.event.customer_action !== 'form_submit') {
    throw new Error('Journey event customer_action is not form_submit.');
  }

  if (bundle.phoneContactPoint.contact_point_id !== expected.phoneContactPointId) {
    throw new Error('Phone contact point id does not match the expected synthetic value.');
  }
  if (bundle.emailContactPoint.contact_point_id !== expected.emailContactPointId) {
    throw new Error('Email contact point id does not match the expected synthetic value.');
  }

  const observationKinds = new Set(bundle.observations.map((observation) => observation.kind));
  for (const requiredKind of ['name', 'phone', 'email']) {
    if (!observationKinds.has(requiredKind as LeadContactObservation['kind'])) {
      throw new Error(`Missing ${requiredKind} contact observation in smoke bundle.`);
    }
  }

  if (bundle.followupWork) {
    throw new Error('Smoke mode unexpectedly created LeadFollowupWork.');
  }
}

function isSyntheticJourney(
  journey: Journey | null,
  request: SmokeRequest,
  expected: ExpectedIdentifiers,
): boolean {
  return Boolean(
    journey &&
      journey.journey_id === expected.journeyId &&
      journey.page_url === request.pageUrl &&
      journey.capture_channel === 'form',
  );
}

function isSyntheticLeadRecord(
  leadRecord: LeadRecord | null,
  request: SmokeRequest,
  expected: ExpectedIdentifiers,
): boolean {
  return Boolean(
    leadRecord &&
      leadRecord.lead_record_id === expected.leadRecordId &&
      leadRecord.journey_id === expected.journeyId &&
      leadRecord.customer_message === request.message,
  );
}

function isSyntheticContact(
  contact: LeadContact | null,
  request: SmokeRequest,
  expected: ExpectedIdentifiers,
): boolean {
  return Boolean(
    contact &&
      contact.contact_id === expected.contactId &&
      contact.normalized_email === expected.normalizedEmail &&
      contact.normalized_phone === expected.normalizedPhone &&
      contact.raw_email === request.email,
  );
}

function isSyntheticEvent(
  event: JourneyEvent | null,
  _request: SmokeRequest,
  expected: ExpectedIdentifiers,
): boolean {
  return Boolean(
    event &&
      event.journey_id === expected.journeyId &&
      event.event_sort_key === expected.eventSortKey &&
      event.client_event_id === expected.clientEventId,
  );
}

function isSyntheticContactPoint(
  point: LeadContactPoint | null,
  expected: ExpectedIdentifiers,
  kind: 'email' | 'phone',
): boolean {
  if (!point) return false;
  if (point.source_event_id !== expected.followupWorkId) return false;
  if (kind === 'email') {
    return point.contact_point_id === expected.emailContactPointId;
  }
  return point.contact_point_id === expected.phoneContactPointId;
}

function isSyntheticObservation(
  observation: LeadContactObservation,
  request: SmokeRequest,
  expected: ExpectedIdentifiers,
): boolean {
  return Boolean(
    observation.contact_id === expected.contactId &&
      observation.source_event_id === expected.followupWorkId &&
      (observation.observed_value === request.name ||
        observation.observed_value === request.email ||
        observation.observed_value === request.phone ||
        observation.normalized_value === expected.normalizedEmail ||
        observation.normalized_value === expected.normalizedPhone),
  );
}

function createEmptyCleanupCounts(): CleanupCounts {
  return {
    contacts: 0,
    contactObservations: 0,
    contactPoints: 0,
    followupWork: 0,
    journeyEvents: 0,
    journeys: 0,
    leadRecords: 0,
  };
}

async function cleanupSyntheticRecords(args: {
  db: DynamoDBDocumentClient;
  expected: ExpectedIdentifiers;
  options: CliOptions;
  request: SmokeRequest;
  tableNames: RuntimeConfig['tableNames'];
}): Promise<CleanupCounts> {
  const counts = createEmptyCleanupCounts();
  const { db, expected, request, tableNames } = args;

  const journey = await getItem<Journey>({
    db,
    key: { journey_id: expected.journeyId },
    tableName: tableNames.journeys,
  });
  const leadRecord = await getItem<LeadRecord>({
    db,
    key: { lead_record_id: expected.leadRecordId },
    tableName: tableNames.leadRecords,
  });
  const contact = await getItem<LeadContact>({
    db,
    key: { contact_id: expected.contactId },
    tableName: tableNames.contacts,
  });
  const event = await getItem<JourneyEvent>({
    db,
    key: {
      journey_id: expected.journeyId,
      event_sort_key: expected.eventSortKey,
    },
    tableName: tableNames.journeyEvents,
  });
  const followupWork = await getItem<LeadFollowupWorkItem>({
    db,
    key: { idempotency_key: expected.idempotencyKey },
    tableName: tableNames.followupWork,
  });
  const [phoneContactPoint, emailContactPoint, observations] = await Promise.all([
    getItem<LeadContactPoint>({
      db,
      key: { contact_point_id: expected.phoneContactPointId },
      tableName: tableNames.contactPoints,
    }),
    getItem<LeadContactPoint>({
      db,
      key: { contact_point_id: expected.emailContactPointId },
      tableName: tableNames.contactPoints,
    }),
    queryItems<LeadContactObservation>({
      db,
      keyConditionExpression: 'contact_id = :contactId',
      expressionAttributeValues: {
        ':contactId': expected.contactId,
      },
      tableName: tableNames.contactObservations,
    }),
  ]);

  if (isSyntheticEvent(event, request, expected)) {
    await db.send(
      new DeleteCommand({
        TableName: tableNames.journeyEvents,
        Key: {
          journey_id: expected.journeyId,
          event_sort_key: expected.eventSortKey,
        },
      }),
    );
    counts.journeyEvents += 1;
  }

  for (const observation of observations.filter((item) =>
    isSyntheticObservation(item, request, expected),
  )) {
    await db.send(
      new DeleteCommand({
        TableName: tableNames.contactObservations,
        Key: {
          contact_id: observation.contact_id,
          observation_sort_key: observation.observation_sort_key,
        },
      }),
    );
    counts.contactObservations += 1;
  }

  for (const [kind, point] of [
    ['phone', phoneContactPoint] as const,
    ['email', emailContactPoint] as const,
  ]) {
    if (!point) continue;
    if (!isSyntheticContactPoint(point, expected, kind)) continue;
    await db.send(
      new DeleteCommand({
        TableName: tableNames.contactPoints,
        Key: { contact_point_id: point.contact_point_id },
      }),
    );
    counts.contactPoints += 1;
  }

  if (followupWork?.idempotency_key === expected.idempotencyKey) {
    await db.send(
      new DeleteCommand({
        TableName: tableNames.followupWork,
        Key: { idempotency_key: expected.idempotencyKey },
      }),
    );
    counts.followupWork += 1;
  }

  if (isSyntheticLeadRecord(leadRecord, request, expected)) {
    await db.send(
      new DeleteCommand({
        TableName: tableNames.leadRecords,
        Key: { lead_record_id: expected.leadRecordId },
      }),
    );
    counts.leadRecords += 1;
  }

  if (isSyntheticJourney(journey, request, expected)) {
    await db.send(
      new DeleteCommand({
        TableName: tableNames.journeys,
        Key: { journey_id: expected.journeyId },
      }),
    );
    counts.journeys += 1;
  }

  if (isSyntheticContact(contact, request, expected)) {
    await db.send(
      new DeleteCommand({
        TableName: tableNames.contacts,
        Key: { contact_id: expected.contactId },
      }),
    );
    counts.contacts += 1;
  }

  return counts;
}

async function run(
  options: CliOptions,
): Promise<
  | SmokeReport
  | { functionName: string; plan: SmokeReport['records']; region: string; runId: string }
> {
  const runtime = await resolveRuntimeConfig(options);
  const runId = createRunId();
  const request = buildSyntheticSmokeRequest(runId);
  const expected = buildExpectedIdentifiers(request);

  if (!options.apply) {
    return {
      functionName: runtime.functionName,
      plan: {
        contactId: expected.contactId,
        followupWorkCreated: false,
        journeyId: expected.journeyId,
        leadRecordId: expected.leadRecordId,
      },
      region: options.region,
      runId,
    };
  }

  const db = createDocumentClient(options);
  let cleanupCounts = createEmptyCleanupCounts();
  const keptRecords = options.keepRecords;
  let cleanedUp = false;

  try {
    const responseIds = await invokeSmokeRequest({
      functionName: runtime.functionName,
      options,
      request,
    });
    if (
      responseIds.journeyId !== expected.journeyId ||
      responseIds.leadRecordId !== expected.leadRecordId
    ) {
      throw new Error('Lambda smoke response ids do not match the deterministic synthetic ids.');
    }

    const bundle = await waitForPersistedBundle({
      db,
      expected,
      options,
      tableNames: runtime.tableNames,
    });
    assertBundleMatchesSyntheticRequest({
      bundle,
      expected,
      request,
    });

    if (!options.keepRecords) {
      cleanupCounts = await cleanupSyntheticRecords({
        db,
        expected,
        options,
        request,
        tableNames: runtime.tableNames,
      });
      cleanedUp = true;
    }

    return {
      cleanedUp,
      cleanupCounts,
      functionName: runtime.functionName,
      keptRecords,
      records: {
        contactId: expected.contactId,
        followupWorkCreated: Boolean(bundle.followupWork),
        journeyId: expected.journeyId,
        leadRecordId: expected.leadRecordId,
      },
      region: options.region,
      runId,
      verified: {
        contactObservations: bundle.observations.length,
        customerAction: bundle.event.customer_action,
        eventName: bundle.event.event_name,
        leadStatus: bundle.leadRecord.status,
        noFollowupWorkQueued: bundle.followupWork === null,
      },
    };
  } catch (error: unknown) {
    if (!options.keepRecords) {
      try {
        cleanupCounts = await cleanupSyntheticRecords({
          db,
          expected,
          options,
          request,
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
      logLine(options.json, 'Region', result.region);
      logLine(options.json, 'Run', result.runId);
      logLine(options.json, 'Journey', result.records.journeyId);
      logLine(options.json, 'LeadRecord', result.records.leadRecordId);
      logLine(options.json, 'Contact', result.records.contactId);
      logLine(options.json, 'Event', result.verified.eventName);
      logLine(
        options.json,
        'FollowupWork',
        result.verified.noFollowupWorkQueued ? 'not created' : 'unexpectedly created',
      );
      logLine(
        options.json,
        'Cleanup',
        result.keptRecords
          ? 'kept synthetic records by request'
          : `deleted ${result.cleanupCounts.journeyEvents} event, ${result.cleanupCounts.contactObservations} observations, ${result.cleanupCounts.contactPoints} contact points, ${result.cleanupCounts.leadRecords} lead record, ${result.cleanupCounts.journeys} journey, ${result.cleanupCounts.contacts} contact`,
      );
      return;
    }

    logLine(options.json, 'Function', result.functionName);
    logLine(options.json, 'Region', result.region);
    logLine(options.json, 'Run', result.runId);
    logLine(options.json, 'Plan', 'resolved runtime and synthetic ids; pass --apply to execute');
    logLine(options.json, 'Journey', result.plan.journeyId);
    logLine(options.json, 'LeadRecord', result.plan.leadRecordId);
    logLine(options.json, 'Contact', result.plan.contactId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] || '') === __filename) {
  await main();
}
