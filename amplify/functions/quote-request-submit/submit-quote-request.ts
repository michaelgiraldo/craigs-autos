import {
  createLeadFollowupWorkItem,
  normalizeWorkString,
} from '../_lead-platform/domain/lead-followup-work.ts';
import { createStableLeadFollowupWorkId } from '../_lead-platform/domain/ids.ts';
import { createLeadSourceEvent } from '../_lead-platform/domain/lead-source-event.ts';
import type { LeadPlatformRepos } from '../_lead-platform/repos/dynamo.ts';
import {
  captureLeadSource,
  LeadSourceCaptureError,
} from '../_lead-platform/services/capture-lead-source.ts';
import type {
  PersistedQuoteRequestLead,
  QuoteRequestLeadIntake,
} from '../_lead-platform/services/followup-work.ts';
import type { QuoteRequestSubmitRequest } from './request.ts';
import type { ResolveFormAttachments } from './attachments.ts';

export type SubmitQuoteRequestDeps = {
  configValid: boolean;
  invokeFollowup: (idempotencyKey: string) => Promise<void>;
  nowEpochSeconds: () => number;
  persistQuoteRequest?: (
    input: QuoteRequestLeadIntake,
  ) => Promise<PersistedQuoteRequestLead | null>;
  repos: LeadPlatformRepos | null;
  resolveFormAttachments?: ResolveFormAttachments;
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

function buildFormIdempotencyKey(request: QuoteRequestSubmitRequest): string {
  const clientEventId = normalizeWorkString(request.clientEventId);
  if (clientEventId) return `form:${clientEventId}`;
  const fallback = [
    request.journeyId,
    request.userId,
    request.email,
    request.phone,
    request.name,
    request.vehicle,
    request.service,
    request.message,
  ]
    .map((value) => normalizeWorkString(value))
    .join('|');
  return `form:${fallback}`;
}

export async function submitQuoteRequest(
  request: QuoteRequestSubmitRequest,
  deps: SubmitQuoteRequestDeps,
): Promise<SubmitQuoteRequestResult> {
  const now = deps.nowEpochSeconds();
  const idempotencyKey = buildFormIdempotencyKey(request);
  const followupWorkId = createStableLeadFollowupWorkId({ idempotencyKey, prefix: 'form' });
  const resolvedAttachments = deps.resolveFormAttachments
    ? await deps.resolveFormAttachments({
        attachments: request.attachments,
        clientEventId: request.clientEventId,
        unsupportedAttachmentCount: request.unsupportedAttachmentCount,
      })
    : {
        attachments: [],
        unsupportedAttachmentCount: request.unsupportedAttachmentCount + request.attachments.length,
      };

  const persistLead = () =>
    deps.persistQuoteRequest
      ? deps.persistQuoteRequest({
          attribution: request.attribution,
          clientEventId: request.clientEventId,
          email: request.email,
          journeyId: request.journeyId,
          locale: request.locale,
          message: request.message,
          photoAttachmentCount: resolvedAttachments.attachments.length,
          unsupportedAttachmentCount: resolvedAttachments.unsupportedAttachmentCount,
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
      : Promise.resolve(null);

  if (request.isSmokeTest) {
    const persistedLead = await persistLead();
    const leadContext = leadContextFromPersistedLead(persistedLead, request);
    return {
      kind: 'smoke_test',
      ...leadContext,
    };
  }

  if (!deps.repos) {
    throw new Error('Lead platform repositories are not configured');
  }

  const sourceEvent = createLeadSourceEvent({
    attribution: request.attribution,
    contactId: null,
    email: request.email,
    idempotencyKey,
    journeyId: request.journeyId,
    leadRecordId: null,
    locale: request.locale,
    message: request.message,
    metadata: {
      attachment_count: request.attachments.length + request.unsupportedAttachmentCount,
      client_event_id: request.clientEventId,
      photo_attachment_count: resolvedAttachments.attachments.length,
      unsupported_attachment_count: resolvedAttachments.unsupportedAttachmentCount,
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
    customerLanguage: sourceEvent.locale,
    name: sourceEvent.name,
    nowEpochSeconds: now,
    origin: sourceEvent.origin,
    pageUrl: sourceEvent.page_url,
    phone: sourceEvent.phone,
    service: sourceEvent.service,
    siteLabel: sourceEvent.site_label,
    sourceEventId: sourceEvent.source_event_id,
    attachments: resolvedAttachments.attachments,
    attachmentCount: request.attachments.length + request.unsupportedAttachmentCount,
    photoAttachmentCount: resolvedAttachments.attachments.length,
    unsupportedAttachmentCount: resolvedAttachments.unsupportedAttachmentCount,
    userId: sourceEvent.user_id,
    vehicle: sourceEvent.vehicle,
  });

  try {
    const receipt = await captureLeadSource({
      invokeFollowup: deps.invokeFollowup,
      nowEpochSeconds: deps.nowEpochSeconds,
      persistLead: async () => leadContextFromPersistedLead(await persistLead(), request),
      repos: deps.repos,
      workItem: record,
    });
    const leadContext = {
      contactId: receipt.workItem?.contact_id ?? null,
      journeyId: receipt.workItem?.journey_id ?? request.journeyId,
      leadRecordId: receipt.leadRecordId,
    };
    return {
      kind: 'submitted',
      followupWorkId: receipt.followupWorkId,
      ...leadContext,
    };
  } catch (error: unknown) {
    if (error instanceof LeadSourceCaptureError && error.stage === 'invoke_worker') {
      console.error('Failed to invoke lead follow-up worker.', error);
      const erroredWork = await deps.repos.followupWork.getByIdempotencyKey(idempotencyKey);
      return {
        kind: 'followup_invoke_failed',
        contactId: erroredWork?.contact_id ?? null,
        journeyId: erroredWork?.journey_id ?? request.journeyId,
        leadRecordId: erroredWork?.lead_record_id ?? null,
        followupWorkId,
      };
    }
    throw error;
  }
}
