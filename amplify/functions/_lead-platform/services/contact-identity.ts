import {
  createLeadContactObservationId,
  createLeadContactObservationSortKey,
  createStableLeadContactId,
  createStableLeadContactPointId,
} from '../domain/ids.ts';
import {
  normalizeEmail,
  normalizePhoneE164,
  splitDisplayName,
  trimToNull,
} from '../domain/normalize.ts';
import type {
  ContactEvidenceConfidence,
  ContactEvidenceSourceChannel,
  ContactEvidenceSourceMethod,
  LeadContact,
  LeadContactPointType,
} from '../domain/contact.ts';
import type { LeadContactObservation } from '../domain/contact-observation.ts';
import type { LeadContactPoint } from '../domain/contact-point.ts';

const CONFIDENCE_RANK: Record<ContactEvidenceConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export type LeadContactIdentityInput = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  sourceChannel: ContactEvidenceSourceChannel;
  sourceEventId?: string | null;
  sourceMethod: ContactEvidenceSourceMethod;
  nameConfidence?: ContactEvidenceConfidence;
  nameSourceMethod?: ContactEvidenceSourceMethod;
  contactPointConfidence?: ContactEvidenceConfidence;
  phoneSourceMethod?: ContactEvidenceSourceMethod;
  emailSourceMethod?: ContactEvidenceSourceMethod;
  occurredAtMs: number;
  recordedAtMs?: number;
};

export type LeadContactIdentity = {
  contact: LeadContact | null;
  contactObservations: LeadContactObservation[];
  contactPoints: LeadContactPoint[];
};

function rankConfidence(value: ContactEvidenceConfidence | null | undefined): number {
  return value ? CONFIDENCE_RANK[value] : 0;
}

function createObservation(args: {
  contactId: string;
  kind: LeadContactObservation['kind'];
  observedValue: string | null;
  normalizedValue: string | null;
  confidence: ContactEvidenceConfidence;
  sourceChannel: ContactEvidenceSourceChannel;
  sourceMethod: ContactEvidenceSourceMethod;
  sourceEventId?: string | null;
  occurredAtMs: number;
  recordedAtMs: number;
  metadata?: Record<string, unknown> | null;
}): LeadContactObservation {
  const observationId = createLeadContactObservationId({
    contactId: args.contactId,
    kind: args.kind,
    normalizedValue: args.normalizedValue ?? args.observedValue,
    sourceEventId: args.sourceEventId ?? null,
    occurredAtMs: args.occurredAtMs,
  });
  return {
    contact_id: args.contactId,
    observation_sort_key: createLeadContactObservationSortKey(args.occurredAtMs, observationId),
    observation_id: observationId,
    kind: args.kind,
    observed_value: args.observedValue,
    normalized_value: args.normalizedValue,
    confidence: args.confidence,
    source_channel: args.sourceChannel,
    source_method: args.sourceMethod,
    source_event_id: trimToNull(args.sourceEventId, 300),
    occurred_at_ms: args.occurredAtMs,
    recorded_at_ms: args.recordedAtMs,
    metadata: args.metadata ?? null,
  };
}

function createContactPoint(args: {
  contactId: string;
  type: LeadContactPointType;
  rawValue: string;
  normalizedValue: string;
  confidence: ContactEvidenceConfidence;
  sourceChannel: ContactEvidenceSourceChannel;
  sourceMethod: ContactEvidenceSourceMethod;
  sourceEventId?: string | null;
  occurredAtMs: number;
}): LeadContactPoint {
  return {
    contact_point_id: createStableLeadContactPointId({
      type: args.type,
      normalizedValue: args.normalizedValue,
    }),
    contact_id: args.contactId,
    type: args.type,
    raw_value: args.rawValue,
    normalized_value: args.normalizedValue,
    eligibility: 'eligible',
    confidence: args.confidence,
    source_channel: args.sourceChannel,
    source_method: args.sourceMethod,
    source_event_id: trimToNull(args.sourceEventId, 300),
    created_at_ms: args.occurredAtMs,
    updated_at_ms: args.occurredAtMs,
  };
}

export function buildLeadContactIdentity(input: LeadContactIdentityInput): LeadContactIdentity {
  const normalizedPhone = normalizePhoneE164(input.phone);
  const normalizedEmail = normalizeEmail(input.email);
  const rawPhone = trimToNull(input.phone, 64);
  const rawEmail = trimToNull(input.email, 320);
  const recordedAtMs = input.recordedAtMs ?? input.occurredAtMs;
  const contactPointConfidence = input.contactPointConfidence ?? 'medium';

  if (!normalizedPhone && !normalizedEmail) {
    return { contact: null, contactObservations: [], contactPoints: [] };
  }

  const contactId = createStableLeadContactId({ normalizedPhone, normalizedEmail });
  const phoneContactPoint = normalizedPhone
    ? createContactPoint({
        contactId,
        type: 'phone',
        rawValue: rawPhone ?? normalizedPhone,
        normalizedValue: normalizedPhone,
        confidence: contactPointConfidence,
        sourceChannel: input.sourceChannel,
        sourceMethod: input.phoneSourceMethod ?? input.sourceMethod,
        sourceEventId: input.sourceEventId,
        occurredAtMs: input.occurredAtMs,
      })
    : null;
  const emailContactPoint = normalizedEmail
    ? createContactPoint({
        contactId,
        type: 'email',
        rawValue: rawEmail ?? normalizedEmail,
        normalizedValue: normalizedEmail,
        confidence: contactPointConfidence,
        sourceChannel: input.sourceChannel,
        sourceMethod: input.emailSourceMethod ?? input.sourceMethod,
        sourceEventId: input.sourceEventId,
        occurredAtMs: input.occurredAtMs,
      })
    : null;
  const nameParts = splitDisplayName(input.name);
  const nameConfidence = input.nameConfidence ?? contactPointConfidence;
  const contact: LeadContact = {
    contact_id: contactId,
    normalized_phone: normalizedPhone,
    normalized_email: normalizedEmail,
    primary_phone_contact_point_id: phoneContactPoint?.contact_point_id ?? null,
    primary_email_contact_point_id: emailContactPoint?.contact_point_id ?? null,
    first_name: nameParts.firstName,
    last_name: nameParts.lastName,
    display_name: nameParts.displayName,
    display_name_confidence: nameParts.displayName ? nameConfidence : null,
    display_name_source_channel: nameParts.displayName ? input.sourceChannel : null,
    display_name_source_method: nameParts.displayName
      ? (input.nameSourceMethod ?? input.sourceMethod)
      : null,
    raw_phone: rawPhone,
    raw_email: rawEmail,
    created_at_ms: input.occurredAtMs,
    updated_at_ms: input.occurredAtMs,
  };

  const contactObservations: LeadContactObservation[] = [];
  if (nameParts.displayName) {
    contactObservations.push(
      createObservation({
        contactId,
        kind: 'name',
        observedValue: nameParts.displayName,
        normalizedValue: nameParts.displayName,
        confidence: nameConfidence,
        sourceChannel: input.sourceChannel,
        sourceMethod: input.nameSourceMethod ?? input.sourceMethod,
        sourceEventId: input.sourceEventId,
        occurredAtMs: input.occurredAtMs,
        recordedAtMs,
      }),
    );
  }
  if (rawPhone || normalizedPhone) {
    contactObservations.push(
      createObservation({
        contactId,
        kind: 'phone',
        observedValue: rawPhone ?? normalizedPhone,
        normalizedValue: normalizedPhone,
        confidence: contactPointConfidence,
        sourceChannel: input.sourceChannel,
        sourceMethod: input.phoneSourceMethod ?? input.sourceMethod,
        sourceEventId: input.sourceEventId,
        occurredAtMs: input.occurredAtMs,
        recordedAtMs,
      }),
    );
  }
  if (rawEmail || normalizedEmail) {
    contactObservations.push(
      createObservation({
        contactId,
        kind: 'email',
        observedValue: rawEmail ?? normalizedEmail,
        normalizedValue: normalizedEmail,
        confidence: contactPointConfidence,
        sourceChannel: input.sourceChannel,
        sourceMethod: input.emailSourceMethod ?? input.sourceMethod,
        sourceEventId: input.sourceEventId,
        occurredAtMs: input.occurredAtMs,
        recordedAtMs,
      }),
    );
  }

  return {
    contact,
    contactObservations,
    contactPoints: [phoneContactPoint, emailContactPoint].filter(
      (item): item is LeadContactPoint => item !== null,
    ),
  };
}

export function createIdentityConflictObservation(args: {
  contactId: string;
  selectedContactId: string;
  phoneMatchedContactId: string | null;
  emailMatchedContactId: string | null;
  sourceChannel: ContactEvidenceSourceChannel;
  sourceMethod: ContactEvidenceSourceMethod;
  sourceEventId?: string | null;
  occurredAtMs: number;
  recordedAtMs?: number;
}): LeadContactObservation {
  return createObservation({
    contactId: args.contactId,
    kind: 'identity_conflict',
    observedValue: null,
    normalizedValue: null,
    confidence: 'low',
    sourceChannel: args.sourceChannel,
    sourceMethod: args.sourceMethod,
    sourceEventId: args.sourceEventId,
    occurredAtMs: args.occurredAtMs,
    recordedAtMs: args.recordedAtMs ?? args.occurredAtMs,
    metadata: {
      selected_contact_id: args.selectedContactId,
      phone_matched_contact_id: args.phoneMatchedContactId,
      email_matched_contact_id: args.emailMatchedContactId,
    },
  });
}

function choosePreferredNameContact(current: LeadContact, incoming: LeadContact): LeadContact {
  const currentRank = rankConfidence(current.display_name_confidence);
  const incomingRank = rankConfidence(incoming.display_name_confidence);
  const incomingDisplayName = incoming.display_name;
  const shouldUseIncoming =
    Boolean(incomingDisplayName) &&
    (!current.display_name ||
      incomingRank > currentRank ||
      (incomingRank === currentRank &&
        (incomingDisplayName?.length ?? 0) > (current.display_name?.length ?? 0)));

  if (!shouldUseIncoming) return current;

  return {
    ...current,
    first_name: incoming.first_name,
    last_name: incoming.last_name,
    display_name: incoming.display_name,
    display_name_confidence: incoming.display_name_confidence,
    display_name_source_channel: incoming.display_name_source_channel,
    display_name_source_method: incoming.display_name_source_method,
  };
}

export function mergeLeadContacts(current: LeadContact, incoming: LeadContact): LeadContact {
  const withName = choosePreferredNameContact(current, incoming);
  return {
    ...withName,
    normalized_phone: current.normalized_phone ?? incoming.normalized_phone,
    normalized_email: current.normalized_email ?? incoming.normalized_email,
    primary_phone_contact_point_id:
      current.primary_phone_contact_point_id ?? incoming.primary_phone_contact_point_id,
    primary_email_contact_point_id:
      current.primary_email_contact_point_id ?? incoming.primary_email_contact_point_id,
    raw_phone: current.raw_phone ?? incoming.raw_phone,
    raw_email: current.raw_email ?? incoming.raw_email,
    created_at_ms: Math.min(current.created_at_ms, incoming.created_at_ms),
    updated_at_ms: Math.max(current.updated_at_ms, incoming.updated_at_ms),
  };
}

export function reassignLeadContactIdentity(
  identity: LeadContactIdentity,
  contactId: string,
): LeadContactIdentity {
  if (!identity.contact) return identity;
  return {
    contact: {
      ...identity.contact,
      contact_id: contactId,
    },
    contactPoints: identity.contactPoints.map((point) => ({
      ...point,
      contact_id: contactId,
    })),
    contactObservations: identity.contactObservations.map((observation) => ({
      ...observation,
      contact_id: contactId,
    })),
  };
}
