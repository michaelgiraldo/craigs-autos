import {
  createQuoteSubmissionRecord,
  type QuoteSubmissionRecord,
} from '../_lead-core/domain/quote-request.ts';
import type {
  PersistedQuoteRequestLead,
  QuoteRequestLeadIntake,
} from '../_lead-core/services/quote-request.ts';
import { getErrorDetails } from '../_shared/safe.ts';
import type { ContactSubmitRequest } from './request.ts';

export type SubmitQuoteRequestDeps = {
  configValid: boolean;
  createSubmissionId: () => string;
  invokeFollowup: (submissionId: string) => Promise<void>;
  nowEpochSeconds: () => number;
  persistQuoteRequest?: (
    input: QuoteRequestLeadIntake,
  ) => Promise<PersistedQuoteRequestLead | null>;
  queueSubmission: (record: QuoteSubmissionRecord) => Promise<void>;
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
      submissionId: string;
    }
  | {
      kind: 'followup_invoke_failed';
      contactId: string | null;
      journeyId: string | null;
      leadRecordId: string | null;
      submissionId: string;
    };

function leadContextFromPersistedLead(
  persistedLead: PersistedQuoteRequestLead | null,
  request: ContactSubmitRequest,
) {
  return {
    contactId: persistedLead?.contactId ?? null,
    journeyId: persistedLead?.journeyId ?? request.journeyId,
    leadRecordId: persistedLead?.leadRecordId ?? null,
  };
}

export async function submitQuoteRequest(
  request: ContactSubmitRequest,
  deps: SubmitQuoteRequestDeps,
): Promise<SubmitQuoteRequestResult> {
  const now = deps.nowEpochSeconds();
  const submissionId = deps.createSubmissionId();
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
        submissionId,
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

  const record = createQuoteSubmissionRecord({
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
    submissionId,
    userId: request.userId,
    vehicle: request.vehicle,
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
    return {
      kind: 'followup_invoke_failed',
      submissionId,
      ...leadContext,
    };
  }

  return {
    kind: 'submitted',
    submissionId,
    ...leadContext,
  };
}
