import { LEAD_EVENTS } from '../../../shared/lead-event-contract.js';
import type { LeadCoreRepos } from '../_lead-core/repos/dynamo.ts';
import { buildChatLeadBundle } from '../_lead-core/services/intake-chat.ts';
import { upsertLeadBundle } from '../_lead-core/services/persist.ts';
import { syncQuoLeadContact } from '../_lead-core/services/quo-sync.ts';
import { buildJourneyEvent } from '../_lead-core/services/journey-events.ts';
import type { InitialOutreachState } from './email-delivery';
import type { LeadAttributionPayload, LeadSummary } from './lead-types';

type PersistCapturedChatLeadArgs = {
  repos: LeadCoreRepos | null;
  threadId: string;
  journeyId: string;
  reason: string;
  locale: string;
  pageUrl: string;
  userId: string;
  attribution: LeadAttributionPayload;
  leadSummary: LeadSummary;
  customerPhone: string | null;
  customerEmail: string | null;
  initialOutreach: InitialOutreachState;
  nowEpochSeconds: () => number;
  quoApiKey: string | null;
  quoLeadTagsFieldKey: string | null;
  quoLeadTagsFieldName: string | null;
  quoContactSource: string | null;
  quoContactExternalIdPrefix: string | null;
};

function buildLatestOutreach(initialOutreach: InitialOutreachState, nowEpochSeconds: () => number) {
  if (initialOutreach.status === 'sent') {
    return {
      channel: 'sms' as const,
      status: 'sent' as const,
      provider: 'quo' as const,
      external_id: initialOutreach.messageId ?? null,
      error: null,
      sent_at_ms: (initialOutreach.sentAt ?? nowEpochSeconds()) * 1000,
    };
  }
  if (initialOutreach.status === 'failed') {
    return {
      channel: 'sms' as const,
      status: 'failed' as const,
      provider: 'quo' as const,
      external_id: initialOutreach.messageId ?? null,
      error: initialOutreach.error ?? null,
      sent_at_ms: null,
    };
  }
  return {
    channel: 'sms' as const,
    status: 'not_attempted' as const,
    provider: 'quo' as const,
    external_id: null,
    error: initialOutreach.error ?? null,
    sent_at_ms: null,
  };
}

export async function persistCapturedChatLead(
  args: PersistCapturedChatLeadArgs,
): Promise<string | null> {
  const repos = args.repos;
  if (!repos) return null;

  const nowMs = args.nowEpochSeconds() * 1000;
  const latestOutreach = buildLatestOutreach(args.initialOutreach, args.nowEpochSeconds);

  const bundle = buildChatLeadBundle({
    threadId: args.threadId,
    occurredAt: nowMs,
    journeyId: args.journeyId,
    reason: args.reason,
    name: args.leadSummary.customer_name ?? null,
    phone: args.customerPhone,
    email: args.customerEmail,
    project: args.leadSummary.project ?? null,
    summary: args.leadSummary.summary ?? null,
    customerLanguage: (args.leadSummary.customer_language ?? args.locale) || null,
    pageUrl: args.pageUrl,
    locale: args.locale,
    userId: args.userId,
    attribution: args.attribution,
    latestOutreach,
  });

  const extraEvents =
    args.initialOutreach.status === 'sent' || args.initialOutreach.status === 'failed'
      ? [
          buildJourneyEvent({
            journeyId: bundle.journey.journey_id,
            leadRecordId: bundle.leadRecord?.lead_record_id ?? null,
            eventName:
              args.initialOutreach.status === 'sent'
                ? LEAD_EVENTS.outreachSmsSent
                : LEAD_EVENTS.outreachSmsFailed,
            occurredAtMs: (args.initialOutreach.sentAt ?? args.nowEpochSeconds()) * 1000,
            recordedAtMs: nowMs,
            actor: 'system',
            discriminator: `${args.threadId}:${args.initialOutreach.status}:${args.initialOutreach.messageId ?? ''}`,
            payload: {
              provider: 'quo',
              external_id: args.initialOutreach.messageId ?? null,
              error: args.initialOutreach.error ?? null,
            },
          }),
        ]
      : [];

  const persisted = await upsertLeadBundle(repos, {
    ...bundle,
    events: [...bundle.events, ...extraEvents],
  });

  if (!persisted.leadRecord) {
    throw new Error('Lead record was not created for chat handoff');
  }

  const quoSyncResult = await syncQuoLeadContact({
    repos,
    contact: persisted.contact,
    leadRecord: persisted.leadRecord,
    occurredAtMs: nowMs,
    config: {
      apiKey: args.quoApiKey ?? '',
      leadTagsFieldKey: args.quoLeadTagsFieldKey,
      leadTagsFieldName: args.quoLeadTagsFieldName,
      source: args.quoContactSource,
      externalIdPrefix: args.quoContactExternalIdPrefix,
    },
  });
  if (quoSyncResult.error) {
    console.error('Lead QUO contact sync failed', quoSyncResult.error);
  }

  return persisted.leadRecord.lead_record_id;
}
