import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sanitizeAttributionSnapshot } from '../_lead-core/domain/attribution.ts';
import {
  createQuoteSubmissionRecord,
  normalizeString,
  type QuoteSubmissionRecord,
} from '../_lead-core/domain/quote-request.ts';
import { createLeadCoreRuntime } from '../_lead-core/runtime.ts';
import {
  persistQuoteRequestLeadIntake,
  type PersistedQuoteRequestLead,
  type QuoteRequestLeadIntake,
} from '../_lead-core/services/quote-request.ts';
import { decodeBody, emptyResponse, getHttpMethod, jsonResponse } from '../_shared/http.ts';
import { getErrorDetails } from '../_shared/safe.ts';
import { isPlausiblePhone } from '../chat-lead-handoff/text-utils.ts';

const envSchema = z.object({
  CONTACT_SITE_LABEL: z.string().trim().min(1),
  QUOTE_SUBMISSIONS_TABLE_NAME: z.string().trim().min(1),
  QUOTE_FOLLOWUP_FUNCTION_NAME: z.string().trim().min(1),
});

const payloadSchema = z.looseObject({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  vehicle: z.string().optional(),
  service: z.string().optional(),
  message: z.string().optional(),
  company: z.string().optional(),
  locale: z.string().optional(),
  pageUrl: z.string().optional(),
  user: z.string().optional(),
  journey_id: z.string().optional(),
  client_event_id: z.string().optional(),
  attribution: z.unknown().optional(),
  __smoke_test: z.boolean().optional(),
});

type LambdaHeaders = Record<string, string | undefined>;

type LambdaEvent = {
  headers?: LambdaHeaders | null;
  requestContext?: { http?: { method?: string } } | null;
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
};

type ContactSubmitDeps = {
  configValid: boolean;
  createSubmissionId: () => string;
  nowEpochSeconds: () => number;
  siteLabel: string;
  persistQuoteRequest?: (
    input: QuoteRequestLeadIntake,
  ) => Promise<PersistedQuoteRequestLead | null>;
  queueSubmission: (record: QuoteSubmissionRecord) => Promise<void>;
  invokeFollowup: (submissionId: string) => Promise<void>;
};

function isValidEmail(value: string) {
  return value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUsablePhone(value: string) {
  return value === '' || isPlausiblePhone(value);
}

export function createContactSubmitHandler(deps: ContactSubmitDeps) {
  return async (event: LambdaEvent) => {
    const method = getHttpMethod(event);
    const isHttpRequest = typeof method === 'string' && method.length > 0;

    if (method === 'OPTIONS') {
      return emptyResponse(204);
    }

    if (isHttpRequest && method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    if (!deps.configValid) {
      console.error('Contact submit function is missing required environment variables.');
      return jsonResponse(500, { error: 'Server missing configuration' });
    }

    try {
      let parsedJson: unknown = event;
      if (isHttpRequest) {
        try {
          const rawBody = decodeBody(event);
          parsedJson = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          return jsonResponse(400, { error: 'Invalid JSON body' });
        }
      }

      const payloadResult = payloadSchema.safeParse(
        parsedJson && typeof parsedJson === 'object' ? parsedJson : {},
      );

      if (!payloadResult.success) {
        return jsonResponse(400, { error: 'Invalid request payload' });
      }

      const payload = payloadResult.data;
      const isSmokeTest = !isHttpRequest && payload.__smoke_test === true;
      const name = normalizeString(payload.name);
      const email = normalizeString(payload.email);
      const phone = normalizeString(payload.phone);
      const vehicle = normalizeString(payload.vehicle);
      const service = normalizeString(payload.service);
      const message = normalizeString(payload.message);
      const company = normalizeString(payload.company);
      const locale = normalizeString(payload.locale);
      const pageUrl = normalizeString(payload.pageUrl);
      const user = normalizeString(payload.user);
      const origin = normalizeString(event.headers?.origin || event.headers?.Origin);
      const sanitizedAttribution = sanitizeAttributionSnapshot(payload.attribution);

      if (company) {
        return jsonResponse(202, { ok: true });
      }

      if (!name || (!phone && !email)) {
        return jsonResponse(400, {
          error: 'Name and either a phone number or email are required.',
        });
      }

      if (!isValidEmail(email)) {
        return jsonResponse(400, {
          error: 'Email is invalid.',
        });
      }

      if (!isUsablePhone(phone)) {
        return jsonResponse(400, {
          error: 'Phone number is invalid.',
        });
      }

      const now = deps.nowEpochSeconds();
      const submissionId = deps.createSubmissionId();
      const effectivePageUrl = pageUrl || origin;
      const persistedLead = deps.persistQuoteRequest
        ? await deps.persistQuoteRequest({
            attribution: sanitizedAttribution,
            clientEventId: normalizeString(payload.client_event_id),
            email,
            journeyId: normalizeString(payload.journey_id),
            locale,
            message,
            name,
            occurredAtMs: now * 1000,
            origin,
            pageUrl: effectivePageUrl,
            phone,
            service,
            siteLabel: deps.siteLabel,
            submissionId,
            userId: user,
            vehicle,
          })
        : null;
      const leadRecordId = persistedLead?.leadRecordId ?? null;

      if (isSmokeTest) {
        return jsonResponse(200, {
          ok: true,
          smoke_test: true,
          ...(persistedLead?.journeyId ? { journey_id: persistedLead.journeyId } : {}),
          ...(leadRecordId ? { lead_record_id: leadRecordId } : {}),
        });
      }

      const record = createQuoteSubmissionRecord({
        submissionId,
        nowEpochSeconds: now,
        name,
        email,
        phone,
        vehicle,
        service,
        message,
        origin,
        siteLabel: deps.siteLabel,
        journeyId: persistedLead?.journeyId ?? (normalizeString(payload.journey_id) || null),
        leadRecordId,
        contactId: persistedLead?.contactId ?? null,
        locale,
        pageUrl: effectivePageUrl,
        userId: user,
        attribution: sanitizedAttribution,
      });

      await deps.queueSubmission(record);

      try {
        await deps.invokeFollowup(submissionId);
      } catch (error: unknown) {
        const { name: errorName, message: errorMessage } = getErrorDetails(error);
        console.error('Failed to invoke quote follow-up worker.', errorName, errorMessage);
        await deps.queueSubmission({
          ...record,
          status: 'error',
          updated_at: deps.nowEpochSeconds(),
        });
        return jsonResponse(502, {
          error: 'Unable to submit your request right now.',
          ...(leadRecordId ? { lead_record_id: leadRecordId } : {}),
        });
      }

      return jsonResponse(200, {
        ok: true,
        ...(leadRecordId ? { lead_record_id: leadRecordId } : {}),
      });
    } catch (error: unknown) {
      console.error('Failed to process contact submit request.', error);
      return jsonResponse(502, { error: 'Unable to submit your request right now.' });
    }
  };
}

const parsedEnv = envSchema.safeParse(process.env);
const lambda = parsedEnv.success ? new LambdaClient({}) : null;
const db = parsedEnv.success ? DynamoDBDocumentClient.from(new DynamoDBClient({})) : null;
const leadCoreRuntime = createLeadCoreRuntime(process.env);

export const handler = createContactSubmitHandler({
  configValid: parsedEnv.success && Boolean(lambda) && Boolean(db) && leadCoreRuntime.configValid,
  createSubmissionId: () => randomUUID(),
  nowEpochSeconds: () => Math.floor(Date.now() / 1000),
  siteLabel: parsedEnv.success ? parsedEnv.data.CONTACT_SITE_LABEL : '',
  persistQuoteRequest: async (input) => {
    const repos = leadCoreRuntime.repos;
    if (!repos) return null;
    return persistQuoteRequestLeadIntake({
      repos,
      input: {
        ...input,
        attribution: sanitizeAttributionSnapshot(input.attribution),
      },
    });
  },
  queueSubmission: async (record: QuoteSubmissionRecord) => {
    if (!db || !parsedEnv.success) return;
    await db.send(
      new PutCommand({
        TableName: parsedEnv.data.QUOTE_SUBMISSIONS_TABLE_NAME,
        Item: record,
      }),
    );
  },
  invokeFollowup: async (submissionId: string) => {
    if (!lambda || !parsedEnv.success) return;
    await lambda.send(
      new InvokeCommand({
        FunctionName: parsedEnv.data.QUOTE_FOLLOWUP_FUNCTION_NAME,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ submission_id: submissionId })),
      }),
    );
  },
});
