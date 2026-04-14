import {
  createJourneyEventId,
  createJourneyEventSortKey,
  createStableLeadContactId,
} from '../domain/ids.ts';
import {
  choosePreferredName,
  dedupeStrings,
  normalizeEmail,
  normalizePhoneE164,
  splitDisplayName,
} from '../domain/normalize.ts';
import { getJourneyEventSemantics } from '../domain/lead-semantics.ts';
import type {
  JourneyEvent,
  JourneyEventActor,
  JourneyEventName,
  JourneyMetadata,
  JourneyStatus,
  LeadContact,
  LeadContactSeed,
  LeadQualificationSnapshot,
} from '../domain/types.ts';

export function buildLeadContact(seed: LeadContactSeed): LeadContact | null {
  const normalizedPhone = normalizePhoneE164(seed.phone);
  const normalizedEmail = normalizeEmail(seed.email);

  if (!normalizedPhone && !normalizedEmail) return null;

  const nameParts = splitDisplayName(seed.name);
  const createdAtMs = seed.createdAtMs;
  const updatedAtMs = seed.updatedAtMs ?? createdAtMs;

  return {
    contact_id: createStableLeadContactId({
      normalizedPhone,
      normalizedEmail,
    }),
    normalized_phone: normalizedPhone,
    normalized_email: normalizedEmail,
    first_name: nameParts.firstName,
    last_name: nameParts.lastName,
    display_name: nameParts.displayName,
    raw_phone: typeof seed.phone === 'string' ? seed.phone.trim() || null : null,
    raw_email: typeof seed.email === 'string' ? seed.email.trim() || null : null,
    quo_contact_id: typeof seed.quoContactId === 'string' ? seed.quoContactId.trim() || null : null,
    quo_tags: dedupeStrings(seed.quoTags ?? []),
    created_at_ms: createdAtMs,
    updated_at_ms: updatedAtMs,
  };
}

export function mergeLeadContacts(current: LeadContact, incoming: LeadContact): LeadContact {
  return {
    ...current,
    normalized_phone: current.normalized_phone ?? incoming.normalized_phone,
    normalized_email: current.normalized_email ?? incoming.normalized_email,
    first_name: choosePreferredName(current.first_name, incoming.first_name),
    last_name: choosePreferredName(current.last_name, incoming.last_name),
    display_name: choosePreferredName(current.display_name, incoming.display_name),
    raw_phone: current.raw_phone ?? incoming.raw_phone,
    raw_email: current.raw_email ?? incoming.raw_email,
    quo_contact_id: current.quo_contact_id ?? incoming.quo_contact_id,
    quo_tags: dedupeStrings([...current.quo_tags, ...incoming.quo_tags]),
    created_at_ms: Math.min(current.created_at_ms, incoming.created_at_ms),
    updated_at_ms: Math.max(current.updated_at_ms, incoming.updated_at_ms),
  };
}

function scoreJourneyStatus(status: JourneyStatus): number {
  switch (status) {
    case 'archived':
      return 4;
    case 'qualified':
      return 3;
    case 'verified':
      return 2;
    case 'captured':
      return 1;
    case 'active':
    case 'incomplete':
      return -1;
  }
}

export function mergeJourneyStatus(current: JourneyStatus, incoming: JourneyStatus): JourneyStatus {
  const currentScore = scoreJourneyStatus(current);
  const incomingScore = scoreJourneyStatus(incoming);

  if (currentScore >= 0 || incomingScore >= 0) {
    return incomingScore > currentScore ? incoming : current;
  }

  return incoming;
}

export function applyJourneyStatusTransition(args: {
  currentStatus: JourneyStatus | null;
  currentReason: string | null;
  incomingStatus: JourneyStatus | null;
  incomingReason: string | null;
}): {
  journeyStatus: JourneyStatus | null;
  statusReason: string | null;
} {
  if (!args.currentStatus) {
    return {
      journeyStatus: args.incomingStatus,
      statusReason: args.incomingStatus ? args.incomingReason : args.currentReason,
    };
  }

  if (!args.incomingStatus) {
    return {
      journeyStatus: args.currentStatus,
      statusReason: args.currentReason,
    };
  }

  const journeyStatus = mergeJourneyStatus(args.currentStatus, args.incomingStatus);
  return {
    journeyStatus,
    statusReason:
      journeyStatus === args.currentStatus ? args.currentReason : args.incomingReason,
  };
}

export function buildJourneyEvent(args: {
  journeyId: string;
  eventName: JourneyEventName;
  occurredAtMs: number;
  recordedAtMs: number;
  actor: JourneyEventActor;
  payload?: Record<string, unknown>;
  leadRecordId?: string | null;
  captureChannel?: JourneyEvent['capture_channel'];
  clientEventId?: string | null;
  discriminator?: string | null;
}): JourneyEvent {
  const semantics = getJourneyEventSemantics(args.eventName);
  const journeyEventId = createJourneyEventId({
    journeyId: args.journeyId,
    eventName: args.eventName,
    occurredAtMs: args.occurredAtMs,
    clientEventId: args.clientEventId,
    discriminator: args.discriminator,
  });

  return {
    journey_id: args.journeyId,
    event_sort_key: createJourneyEventSortKey(args.occurredAtMs, journeyEventId),
    journey_event_id: journeyEventId,
    client_event_id: args.clientEventId ?? null,
    lead_record_id: args.leadRecordId ?? null,
    event_name: args.eventName,
    event_class: semantics.eventClass,
    customer_action: semantics.customerAction,
    workflow_outcome: semantics.workflowOutcome,
    capture_channel: args.captureChannel ?? semantics.captureChannel,
    lead_strength: semantics.leadStrength,
    verification_status: semantics.verificationStatus,
    occurred_at_ms: args.occurredAtMs,
    recorded_at_ms: args.recordedAtMs,
    actor: args.actor,
    payload: args.payload ?? {},
  };
}

export function buildDefaultQualificationSnapshot(
  input?: Partial<LeadQualificationSnapshot>,
): LeadQualificationSnapshot {
  return {
    qualified: input?.qualified ?? false,
    qualified_at_ms: input?.qualified_at_ms ?? null,
    uploaded_google_ads: input?.uploaded_google_ads ?? false,
    uploaded_google_ads_at_ms: input?.uploaded_google_ads_at_ms ?? null,
  };
}

export function serializeJourneyMetadata(source: JourneyMetadata): Record<string, unknown> {
  return {
    lead_user_id: source.lead_user_id,
    thread_id: source.thread_id,
    locale: source.locale,
    page_url: source.page_url,
    page_path: source.page_path,
    origin: source.origin,
    site_label: source.site_label,
    attribution: source.attribution,
  };
}
