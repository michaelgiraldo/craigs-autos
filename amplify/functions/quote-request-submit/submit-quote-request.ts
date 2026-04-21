import {
  createLeadFollowupWorkItem,
  normalizeWorkString,
  type LeadFollowupWorkItem,
} from '../_lead-platform/domain/lead-followup-work.ts';
import { createLeadSourceEvent } from '../_lead-platform/domain/lead-source-event.ts';
import type {
  PersistedQuoteRequestLead,
  QuoteRequestLeadIntake,
} from '../_lead-platform/services/followup-work.ts';
import { getErrorDetails } from '../_shared/safe.ts';
import type { QuoteRequestSubmitRequest } from './request.ts';

export type SubmitQuoteRequestDeps = {
  configValid: boolean;
  createFollowupWorkId: () => string;
  enqueueFollowupWork: (record: LeadFollowupWorkItem) => Promise<void>;
  invokeFollowup: (followupWorkId: string) => Promise<void>;
  nowEpochSeconds: () => number;
  persistQuoteRequest?: (
    input: QuoteRequestLeadIntake,
  ) => Promise<PersistedQuoteRequestLead | null>;
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
      followupWorkId: string;
    }
  | {
      kind: 'followup_invoke_failed';
      contactId: string | null;
      journeyId: string | null;
      leadRecordId: string | null;
      followupWorkId: string;
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

function buildFormFollowupWorkId(request: QuoteRequestSubmitRequest, fallbackId: string): string {
  const clientEventId = normalizeWorkString(request.clientEventId);
  return clientEventId ? `form_${clientEventId}` : fallbackId;
}

export async function submitQuoteRequest(
  request: QuoteRequestSubmitRequest,
  deps: SubmitQuoteRequestDeps,
): Promise<SubmitQuoteRequestResult> {
  const now = deps.nowEpochSeconds();
  const followupWorkId = buildFormFollowupWorkId(request, deps.createFollowupWorkId());
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
        followupWorkId,
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

  const idempotencyKey = `form:${request.clientEventId || followupWorkId}`;
  const sourceEvent = createLeadSourceEvent({
    attribution: request.attribution,
    contactId: leadContext.contactId,
    email: request.email,
    idempotencyKey,
    journeyId: leadContext.journeyId,
    leadRecordId: leadContext.leadRecordId,
    locale: request.locale,
    message: request.message,
    metadata: {
      client_event_id: request.clientEventId,
    },
    name: request.name,
    occurredAtMs: now * 1000,
    origin: request.origin,
    pageUrl: request.effectivePageUrl,
    phone: request.phone,
    service: request.service,
    siteLabel: deps.siteLabel,
    source: 'form',
    sourceEventId: followupWorkId,
    userId: request.userId,
    vehicle: request.vehicle,
  });

  const record = createLeadFollowupWorkItem({
    attribution: sourceEvent.attribution,
    captureChannel: sourceEvent.source,
    contactId: sourceEvent.contact_id,
    email: sourceEvent.email,
    followupWorkId,
    idempotencyKey: sourceEvent.idempotency_key,
    journeyId: sourceEvent.journey_id,
    leadRecordId: sourceEvent.lead_record_id,
    locale: sourceEvent.locale,
    message: sourceEvent.message,
    name: sourceEvent.name,
    nowEpochSeconds: now,
    origin: sourceEvent.origin,
    pageUrl: sourceEvent.page_url,
    phone: sourceEvent.phone,
    service: sourceEvent.service,
    siteLabel: sourceEvent.site_label,
    sourceEventId: sourceEvent.source_event_id,
    userId: sourceEvent.user_id,
    vehicle: sourceEvent.vehicle,
  });

  await deps.enqueueFollowupWork(record);

  try {
    await deps.invokeFollowup(followupWorkId);
  } catch (error: unknown) {
    const { name: errorName, message: errorMessage } = getErrorDetails(error);
    console.error('Failed to invoke lead follow-up worker.', errorName, errorMessage);
    await deps.enqueueFollowupWork({
      ...record,
      status: 'error',
      updated_at: deps.nowEpochSeconds(),
    });
    return {
      kind: 'followup_invoke_failed',
      followupWorkId,
      ...leadContext,
    };
  }

  return {
    kind: 'submitted',
    followupWorkId,
    ...leadContext,
  };
}
