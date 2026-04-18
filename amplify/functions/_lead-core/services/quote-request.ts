import type { LeadContact } from '../domain/contact.ts';
import type { Journey } from '../domain/journey.ts';
import type { LeadRecord } from '../domain/lead-record.ts';
import type { QuoteSubmissionRecord } from '../domain/quote-request.ts';
import type { LeadCoreRepos } from '../repos/dynamo.ts';
import {
  buildLegacyQuoteOutreachEvents,
  deriveLeadRecordStatus,
  deriveLegacyQuoteOutreach,
} from './outreach.ts';
import { buildFormLeadBundle } from './intake-form.ts';
import { upsertLeadBundle } from './persist.ts';
import { syncQuoLeadContact } from './quo-sync.ts';

export type QuoteRequestLeadIntake = {
  attribution: QuoteSubmissionRecord['attribution'];
  clientEventId: string | null;
  email: string;
  journeyId: string | null;
  locale: string;
  message: string;
  name: string;
  occurredAtMs: number;
  origin: string;
  pageUrl: string;
  phone: string;
  service: string;
  siteLabel: string;
  submissionId: string;
  userId: string;
  vehicle: string;
};

export type PersistedQuoteRequestLead = {
  contactId: string | null;
  journeyId: string;
  leadRecordId: string | null;
};

export type QuoteLeadSyncConfig = {
  apiKey: string;
  leadTagsFieldKey: string | null;
  leadTagsFieldName: string | null;
  source: string | null;
  externalIdPrefix: string | null;
};

type ResolvedLeadContext = {
  contact: LeadContact | null;
  journey: Journey;
  leadRecord: LeadRecord;
};

export async function persistQuoteRequestLeadIntake(args: {
  input: QuoteRequestLeadIntake;
  repos: LeadCoreRepos;
}): Promise<PersistedQuoteRequestLead> {
  const bundle = buildFormLeadBundle({
    submissionId: args.input.submissionId,
    occurredAt: args.input.occurredAtMs,
    journeyId: args.input.journeyId,
    clientEventId: args.input.clientEventId,
    attribution: args.input.attribution,
    email: args.input.email,
    locale: args.input.locale,
    message: args.input.message,
    name: args.input.name,
    origin: args.input.origin,
    pageUrl: args.input.pageUrl,
    phone: args.input.phone,
    service: args.input.service,
    siteLabel: args.input.siteLabel,
    userId: args.input.userId,
    vehicle: args.input.vehicle,
  });
  const persisted = await upsertLeadBundle(args.repos, bundle);

  return {
    contactId: persisted.contact?.contact_id ?? null,
    journeyId: persisted.journey.journey_id,
    leadRecordId: persisted.leadRecord?.lead_record_id ?? null,
  };
}

async function resolveLeadContext(
  repos: LeadCoreRepos,
  record: QuoteSubmissionRecord,
): Promise<ResolvedLeadContext | null> {
  const directLeadRecord = record.lead_record_id
    ? await repos.leadRecords.getById(record.lead_record_id)
    : null;
  const directJourney = record.journey_id ? await repos.journeys.getById(record.journey_id) : null;

  const leadRecord =
    directLeadRecord ??
    (directJourney?.lead_record_id
      ? await repos.leadRecords.getById(directJourney.lead_record_id)
      : null);
  if (!leadRecord) return null;

  const journey =
    directJourney ??
    (leadRecord.journey_id ? await repos.journeys.getById(leadRecord.journey_id) : null);
  if (!journey) return null;

  const contactId = leadRecord.contact_id ?? journey.contact_id ?? record.contact_id ?? null;
  const contact = contactId ? await repos.contacts.getById(contactId) : null;

  return { contact, journey, leadRecord };
}

export async function applyQuoteFollowupToLeadRecord(args: {
  repos: LeadCoreRepos;
  record: QuoteSubmissionRecord;
  quoConfig: QuoteLeadSyncConfig;
}): Promise<void> {
  const resolved = await resolveLeadContext(args.repos, args.record);
  if (!resolved) return;

  const occurredAtMs = args.record.updated_at * 1000;
  const latestOutreach = deriveLegacyQuoteOutreach(args.record);
  const persisted = await upsertLeadBundle(args.repos, {
    contact: resolved.contact,
    journey: {
      ...resolved.journey,
      updated_at_ms: Math.max(resolved.journey.updated_at_ms, occurredAtMs),
    },
    leadRecord: {
      ...resolved.leadRecord,
      status: deriveLeadRecordStatus({
        qualification: resolved.leadRecord.qualification,
        latestOutreach,
      }),
      latest_outreach: latestOutreach,
      updated_at_ms: Math.max(resolved.leadRecord.updated_at_ms, occurredAtMs),
    },
    events: [],
  });

  if (!persisted.leadRecord) return;

  const outreachEvents = buildLegacyQuoteOutreachEvents({
    journeyId: persisted.journey.journey_id,
    leadRecordId: persisted.leadRecord.lead_record_id,
    occurredAtMs,
    recordedAtMs: occurredAtMs,
    record: args.record,
    discriminator: `${args.record.submission_id}:${args.record.updated_at}`,
  });
  await args.repos.journeyEvents.appendMany(outreachEvents);

  const quoSyncResult = await syncQuoLeadContact({
    repos: args.repos,
    contact: persisted.contact,
    leadRecord: persisted.leadRecord,
    occurredAtMs,
    config: {
      apiKey: args.quoConfig.apiKey,
      leadTagsFieldKey: args.quoConfig.leadTagsFieldKey,
      leadTagsFieldName: args.quoConfig.leadTagsFieldName,
      source: args.quoConfig.source,
      externalIdPrefix: args.quoConfig.externalIdPrefix,
    },
  });
  if (quoSyncResult.error) {
    console.error('Failed to sync QUO contact from quote follow-up.', quoSyncResult.error);
  }
}
