import { createStableLeadContactId } from '../domain/ids.ts';
import {
  choosePreferredName,
  dedupeStrings,
  normalizeEmail,
  normalizePhoneE164,
  splitDisplayName,
} from '../domain/normalize.ts';
import type { LeadContact, LeadContactSeed } from '../domain/contact.ts';

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
