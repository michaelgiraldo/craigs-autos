import type { LeadPlatformRepos } from '../_lead-platform/repos/dynamo.ts';
import { buildChatLeadBundle } from '../_lead-platform/services/intake-chat.ts';
import { upsertLeadBundle } from '../_lead-platform/services/persist.ts';
import type { LeadAttributionPayload, LeadSummary } from './lead-types';

type PersistCapturedChatLeadArgs = {
  repos: LeadPlatformRepos | null;
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
  nowEpochSeconds: () => number;
};

export type PersistedCapturedChatLead = {
  contactId: string | null;
  journeyId: string;
  leadRecordId: string;
};

export async function persistCapturedChatLead(
  args: PersistCapturedChatLeadArgs,
): Promise<PersistedCapturedChatLead | null> {
  const repos = args.repos;
  if (!repos) return null;

  const nowMs = args.nowEpochSeconds() * 1000;

  const bundle = buildChatLeadBundle({
    threadId: args.threadId,
    occurredAt: nowMs,
    journeyId: args.journeyId,
    reason: args.reason,
    name: args.leadSummary.customer_name ?? null,
    phone: args.customerPhone,
    email: args.customerEmail,
    vehicle: args.leadSummary.vehicle ?? null,
    service: args.leadSummary.service ?? null,
    projectSummary: args.leadSummary.project_summary ?? null,
    customerMessage: args.leadSummary.customer_message ?? args.leadSummary.project_summary ?? null,
    customerLanguage: (args.leadSummary.customer_language ?? args.locale) || null,
    leadSummary: args.leadSummary,
    pageUrl: args.pageUrl,
    locale: args.locale,
    userId: args.userId,
    attribution: args.attribution,
  });

  const persisted = await upsertLeadBundle(repos, bundle);

  if (!persisted.leadRecord) {
    throw new Error('Lead record was not created for chat handoff');
  }

  return {
    contactId: persisted.contact?.contact_id ?? null,
    journeyId: persisted.journey.journey_id,
    leadRecordId: persisted.leadRecord.lead_record_id,
  };
}
