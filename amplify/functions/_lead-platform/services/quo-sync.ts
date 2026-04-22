import type { LeadPlatformRepos } from '../repos/dynamo.ts';
import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';
import { dedupeStrings } from '../domain/normalize.ts';
import type { LeadContact } from '../domain/contact.ts';
import type { CaptureChannel } from '../domain/lead-actions.ts';
import type { LeadRecord } from '../domain/lead-record.ts';
import type { ProviderContactProjection } from '../domain/provider-contact-projection.ts';
import {
  createProviderExternalId,
  createStableProviderContactProjectionId,
} from '../domain/ids.ts';
import { getErrorDetails } from '../../_shared/safe.ts';
import {
  createQuoContact,
  listQuoContactCustomFields,
  listQuoContacts,
  updateQuoContact,
} from './providers/quo/quo-client.ts';
import type { ProviderReadiness } from './providers/provider-contracts.ts';
import { buildJourneyEvent } from './journey-events.ts';

export type QuoLeadTag = 'Chat Lead' | 'Email Lead' | 'Form Lead';

export type QuoContactUpsertPayload = {
  source: string;
  externalId: string;
  sourceUrl?: string;
  defaultFields: {
    firstName?: string;
    lastName?: string;
    phoneNumbers?: Array<{ name: string; value: string }>;
    emails?: Array<{ name: string; value: string }>;
  };
  customFields: Array<{ key: string; value: string[] }>;
};

export function buildQuoLeadTag(channel: CaptureChannel): QuoLeadTag {
  switch (channel) {
    case 'chat':
      return 'Chat Lead';
    case 'email':
      return 'Email Lead';
    case 'form':
      return 'Form Lead';
    default:
      throw new Error(`Unsupported QUO lead tag channel: ${channel}`);
  }
}

export function buildQuoExternalId(contact: LeadContact, sourcePrefix: string): string | null {
  if (!sourcePrefix.trim()) return null;
  if (contact.normalized_phone) return `${sourcePrefix}:phone:${contact.normalized_phone}`;
  if (contact.normalized_email) return `${sourcePrefix}:email:${contact.normalized_email}`;
  return null;
}

export function mergeQuoTags(existingTags: string[], channel: CaptureChannel): string[] {
  return dedupeStrings([...existingTags, buildQuoLeadTag(channel)]);
}

export function buildQuoContactUpsert(args: {
  contact: LeadContact;
  leadRecord: LeadRecord;
  leadTagsFieldKey: string;
  existingTags: string[];
  source?: string;
  externalIdPrefix: string;
  sourceUrl?: string | null;
}): QuoContactUpsertPayload | null {
  const externalId = buildQuoExternalId(args.contact, args.externalIdPrefix);
  if (!externalId) return null;

  const mergedTags = mergeQuoTags(args.existingTags, args.leadRecord.capture_channel);
  const defaultFields: QuoContactUpsertPayload['defaultFields'] = {};

  if (args.contact.first_name) defaultFields.firstName = args.contact.first_name;
  if (args.contact.last_name) defaultFields.lastName = args.contact.last_name;
  if (args.contact.normalized_phone) {
    defaultFields.phoneNumbers = [{ name: 'mobile', value: args.contact.normalized_phone }];
  }
  if (args.contact.normalized_email) {
    defaultFields.emails = [{ name: 'primary', value: args.contact.normalized_email }];
  }

  return {
    source: args.source ?? '',
    externalId,
    ...(args.sourceUrl ? { sourceUrl: args.sourceUrl } : {}),
    defaultFields,
    customFields: [{ key: args.leadTagsFieldKey, value: mergedTags }],
  };
}

export type QuoLeadSyncConfig = {
  apiKey: string;
  leadTagsFieldKey?: string | null;
  leadTagsFieldName?: string | null;
  source?: string | null;
  externalIdPrefix?: string | null;
  sourceUrl?: string | null;
  readiness?: ProviderReadiness | null;
};

export type QuoLeadSyncResult = {
  synced: boolean;
  quoContactId: string | null;
  quoTags: string[];
  leadTagsFieldKey: string | null;
  error: string | null;
};

function normalizeFieldName(value: string): string {
  return value.trim().toLowerCase();
}

function findCustomFieldValue(
  customFields: Array<{ key: string; value: string[] }>,
  key: string,
): string[] {
  const match = customFields.find((field) => field.key === key);
  return match ? dedupeStrings(match.value) : [];
}

async function resolveLeadTagsFieldKey(args: QuoLeadSyncConfig): Promise<string> {
  const configuredKey =
    typeof args.leadTagsFieldKey === 'string' ? args.leadTagsFieldKey.trim() : '';
  if (configuredKey) return configuredKey;

  const configuredNames = dedupeStrings(
    [args.leadTagsFieldName ?? '', 'Lead Tags', 'Lead Tag', 'Tags'].filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    ),
  ).map(normalizeFieldName);

  const customFields = await listQuoContactCustomFields({ apiKey: args.apiKey });
  const exact = customFields.find((field) =>
    configuredNames.includes(normalizeFieldName(field.name)),
  );
  if (exact) return exact.key;

  const multiSelectFields = customFields.filter((field) => field.type === 'multi-select');
  if (multiSelectFields.length === 1) return multiSelectFields[0].key;

  const availableFieldNames = multiSelectFields.map((field) => field.name).join(', ');
  throw new Error(
    availableFieldNames
      ? `QUO lead tags custom field was not found. Available multi-select fields: ${availableFieldNames}`
      : 'QUO lead tags custom field was not found and no multi-select contact fields are available',
  );
}

async function upsertQuoLeadContact(args: {
  config: QuoLeadSyncConfig;
  contact: LeadContact;
  existingProjection: ProviderContactProjection | null;
  leadRecord: LeadRecord;
}): Promise<{ quoContactId: string; quoTags: string[]; leadTagsFieldKey: string }> {
  const source =
    typeof args.config.source === 'string' && args.config.source.trim()
      ? args.config.source.trim()
      : '';
  const externalIdPrefix =
    typeof args.config.externalIdPrefix === 'string' && args.config.externalIdPrefix.trim()
      ? args.config.externalIdPrefix.trim()
      : '';
  if (args.config.readiness && !args.config.readiness.ready) {
    throw new Error(args.config.readiness.message);
  }
  if (!source) throw new Error('QUO contact source is missing');
  if (!externalIdPrefix) throw new Error('QUO external id prefix is missing');
  const leadTagsFieldKey = await resolveLeadTagsFieldKey(args.config);
  const payloadBase = buildQuoContactUpsert({
    contact: args.contact,
    leadRecord: args.leadRecord,
    leadTagsFieldKey,
    existingTags: args.existingProjection?.tags ?? [],
    source,
    externalIdPrefix,
    sourceUrl: args.config.sourceUrl ?? null,
  });
  if (!payloadBase) {
    throw new Error('Unable to build QUO contact payload without a normalized phone or email');
  }

  const existingContacts = await listQuoContacts({
    apiKey: args.config.apiKey,
    externalIds: [payloadBase.externalId],
    sources: [source],
    maxResults: 10,
  });
  const existingContact =
    existingContacts.find(
      (contact) => contact.externalId === payloadBase.externalId && contact.source === source,
    ) ??
    existingContacts[0] ??
    null;
  const existingTags = existingContact
    ? findCustomFieldValue(existingContact.customFields, leadTagsFieldKey)
    : (args.existingProjection?.tags ?? []);
  const payload = buildQuoContactUpsert({
    contact: args.contact,
    leadRecord: args.leadRecord,
    leadTagsFieldKey,
    existingTags,
    source,
    externalIdPrefix,
    sourceUrl: args.config.sourceUrl ?? null,
  });
  if (!payload) {
    throw new Error('Unable to build QUO contact payload without a normalized phone or email');
  }

  const syncedContact = existingContact
    ? await updateQuoContact({
        apiKey: args.config.apiKey,
        contactId: existingContact.id,
        payload,
      })
    : await createQuoContact({
        apiKey: args.config.apiKey,
        payload,
      });

  return {
    quoContactId: syncedContact.id,
    quoTags: findCustomFieldValue(syncedContact.customFields, leadTagsFieldKey).length
      ? findCustomFieldValue(syncedContact.customFields, leadTagsFieldKey)
      : (payload.customFields[0]?.value ?? []),
    leadTagsFieldKey,
  };
}

function shouldSyncQuoLead(args: {
  contact: LeadContact | null;
  leadRecord: LeadRecord;
  config: QuoLeadSyncConfig;
}): boolean {
  if (!args.contact) return false;
  if (!args.config.apiKey.trim()) return false;
  return (
    args.leadRecord.latest_outreach.provider === 'quo' &&
    args.leadRecord.latest_outreach.channel === 'sms' &&
    args.leadRecord.latest_outreach.status === 'sent'
  );
}

function projectionIdForContact(contact: LeadContact): string {
  return createStableProviderContactProjectionId({
    contactId: contact.contact_id,
    provider: 'quo',
  });
}

async function getQuoProjection(
  repos: LeadPlatformRepos,
  contact: LeadContact | null,
): Promise<ProviderContactProjection | null> {
  return contact ? repos.providerContactProjections.getById(projectionIdForContact(contact)) : null;
}

export async function syncQuoLeadContact(args: {
  repos: LeadPlatformRepos;
  contact: LeadContact | null;
  leadRecord: LeadRecord;
  occurredAtMs: number;
  config: QuoLeadSyncConfig;
}): Promise<QuoLeadSyncResult> {
  const existingProjection = await getQuoProjection(args.repos, args.contact);
  if (!shouldSyncQuoLead(args)) {
    return {
      synced: false,
      quoContactId: existingProjection?.provider_contact_id ?? null,
      quoTags: existingProjection?.tags ?? [],
      leadTagsFieldKey:
        typeof args.config.leadTagsFieldKey === 'string' && args.config.leadTagsFieldKey.trim()
          ? args.config.leadTagsFieldKey.trim()
          : null,
      error: null,
    };
  }

  const contact = args.contact;
  if (!contact) {
    return {
      synced: false,
      quoContactId: null,
      quoTags: [],
      leadTagsFieldKey: null,
      error: 'Lead contact is missing',
    };
  }

  try {
    const synced = await upsertQuoLeadContact({
      config: args.config,
      contact,
      existingProjection,
      leadRecord: args.leadRecord,
    });
    const externalId = args.config.externalIdPrefix
      ? buildQuoExternalId(contact, args.config.externalIdPrefix)
      : null;
    await args.repos.providerContactProjections.put({
      projection_id: projectionIdForContact(contact),
      contact_id: contact.contact_id,
      provider: 'quo',
      provider_contact_id: synced.quoContactId,
      provider_external_id: createProviderExternalId({
        provider: 'quo',
        providerContactId: synced.quoContactId,
      }),
      source: args.config.source ?? null,
      external_id: externalId,
      tags: synced.quoTags,
      metadata: {
        lead_tags_field_key: synced.leadTagsFieldKey,
      },
      created_at_ms: existingProjection?.created_at_ms ?? args.occurredAtMs,
      updated_at_ms: args.occurredAtMs,
    });
    await args.repos.journeyEvents.append(
      buildJourneyEvent({
        journeyId: args.leadRecord.journey_id,
        leadRecordId: args.leadRecord.lead_record_id,
        eventName: LEAD_EVENTS.quoContactSynced,
        occurredAtMs: args.occurredAtMs,
        recordedAtMs: args.occurredAtMs,
        actor: 'system',
        discriminator: `${args.leadRecord.lead_record_id}:${synced.quoContactId}:${args.leadRecord.latest_outreach.external_id ?? ''}`,
        payload: {
          provider_contact_id: synced.quoContactId,
          provider_tags: synced.quoTags,
          lead_tags_field_key: synced.leadTagsFieldKey,
          source: args.config.source ?? null,
          external_id: externalId,
        },
      }),
    );
    return {
      synced: true,
      quoContactId: synced.quoContactId,
      quoTags: synced.quoTags,
      leadTagsFieldKey: synced.leadTagsFieldKey,
      error: null,
    };
  } catch (error: unknown) {
    const { message } = getErrorDetails(error);
    const errorMessage = message ?? 'QUO contact sync failed';
    try {
      await args.repos.journeyEvents.append(
        buildJourneyEvent({
          journeyId: args.leadRecord.journey_id,
          leadRecordId: args.leadRecord.lead_record_id,
          eventName: LEAD_EVENTS.quoContactSyncFailed,
          occurredAtMs: args.occurredAtMs,
          recordedAtMs: args.occurredAtMs,
          actor: 'system',
          discriminator: `${args.leadRecord.lead_record_id}:${args.leadRecord.latest_outreach.external_id ?? ''}:${errorMessage}`,
          payload: {
            error: errorMessage,
            source: args.config.source ?? null,
            configured_field_name: args.config.leadTagsFieldName ?? null,
            configured_field_key: args.config.leadTagsFieldKey ?? null,
          },
        }),
      );
    } catch {
      // Best effort logging only; Quo sync must not block lead processing.
    }
    return {
      synced: false,
      quoContactId: existingProjection?.provider_contact_id ?? null,
      quoTags: existingProjection?.tags ?? [],
      leadTagsFieldKey:
        typeof args.config.leadTagsFieldKey === 'string' && args.config.leadTagsFieldKey.trim()
          ? args.config.leadTagsFieldKey.trim()
          : null,
      error: errorMessage,
    };
  }
}
