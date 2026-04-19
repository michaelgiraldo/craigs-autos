import {
  createQuoteRequestRecord,
  type QuoteRequestRecord,
} from '../_lead-platform/domain/quote-request.ts';
import type {
  PersistedQuoteRequestLead,
  QuoteRequestLeadIntake,
} from '../_lead-platform/services/quote-request.ts';
import { getErrorDetails } from '../_shared/safe.ts';
import type { QuoteRequestSubmitRequest } from './request.ts';

export type SubmitQuoteRequestDeps = {
  configValid: boolean;
  createQuoteRequestId: () => string;
  invokeFollowup: (quoteRequestId: string) => Promise<void>;
  nowEpochSeconds: () => number;
  persistQuoteRequest?: (
    input: QuoteRequestLeadIntake,
  ) => Promise<PersistedQuoteRequestLead | null>;
  queueQuoteRequest: (record: QuoteRequestRecord) => Promise<void>;
  siteLabel: string;
};

export type SubmitQuoteRequestResult =
  | {
      kind: 'smoke_test';
      contactId: string | null;
      journeyId: string | null;
      leadRecordId: string | null;
    }
  | {
      kind: 'submitted';
      contactId: string | null;
      journeyId: string | null;
      leadRecordId: string | null;
      quoteRequestId: string;
    }
  | {
      kind: 'followup_invoke_failed';
      contactId: string | null;
      journeyId: string | null;
      leadRecordId: string | null;
      quoteRequestId: string;
    };

function leadContextFromPersistedLead(
  persistedLead: PersistedQuoteRequestLead | null,
  request: QuoteRequestSubmitRequest,
) {
  return {
    contactId: persistedLead?.contactId ?? null,
    journeyId: persistedLead?.journeyId ?? request.journeyId,
    leadRecordId: persistedLead?.leadRecordId ?? null,
  };
}

export async function submitQuoteRequest(
  request: QuoteRequestSubmitRequest,
  deps: SubmitQuoteRequestDeps,
): Promise<SubmitQuoteRequestResult> {
  const now = deps.nowEpochSeconds();
  const quoteRequestId = deps.createQuoteRequestId();
  const persistedLead = deps.persistQuoteRequest
    ? await deps.persistQuoteRequest({
        attribution: request.attribution,
        clientEventId: request.clientEventId,
        email: request.email,
        journeyId: request.journeyId,
        locale: request.locale,
        message: request.message,
        name: request.name,
        occurredAtMs: now * 1000,
        origin: request.origin,
        pageUrl: request.effectivePageUrl,
        phone: request.phone,
        service: request.service,
        siteLabel: deps.siteLabel,
        quoteRequestId,
        userId: request.userId,
        vehicle: request.vehicle,
      })
    : null;
  const leadContext = leadContextFromPersistedLead(persistedLead, request);

  if (request.isSmokeTest) {
    return {
      kind: 'smoke_test',
      ...leadContext,
    };
  }

  const record = createQuoteRequestRecord({
    attribution: request.attribution,
    contactId: leadContext.contactId,
    email: request.email,
    journeyId: leadContext.journeyId,
    leadRecordId: leadContext.leadRecordId,
    locale: request.locale,
    message: request.message,
    name: request.name,
    nowEpochSeconds: now,
    origin: request.origin,
    pageUrl: request.effectivePageUrl,
    phone: request.phone,
    service: request.service,
    siteLabel: deps.siteLabel,
    quoteRequestId,
    userId: request.userId,
    vehicle: request.vehicle,
  });

  await deps.queueQuoteRequest(record);

  try {
    await deps.invokeFollowup(quoteRequestId);
  } catch (error: unknown) {
    const { name: errorName, message: errorMessage } = getErrorDetails(error);
    console.error('Failed to invoke lead follow-up worker.', errorName, errorMessage);
    await deps.queueQuoteRequest({
      ...record,
      status: 'error',
      updated_at: deps.nowEpochSeconds(),
    });
    return {
      kind: 'followup_invoke_failed',
      quoteRequestId,
      ...leadContext,
    };
  }

  return {
    kind: 'submitted',
    quoteRequestId,
    ...leadContext,
  };
}
