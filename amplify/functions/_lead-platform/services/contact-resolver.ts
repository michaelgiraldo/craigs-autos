import type { LeadContact } from '../domain/contact.ts';
import type { LeadPlatformRepos } from '../repos/dynamo.ts';
import { createIdentityConflictObservation } from './contact-identity.ts';
import type { LeadContactIdentity } from './contact-identity.ts';

export async function findExistingContact(
  repos: LeadPlatformRepos,
  contact: LeadContact,
): Promise<LeadContact | null> {
  if (contact.normalized_phone) {
    const byPhone = await repos.contacts.findByNormalizedPhone(contact.normalized_phone);
    if (byPhone) return byPhone;
  }
  if (contact.normalized_email) {
    const byEmail = await repos.contacts.findByNormalizedEmail(contact.normalized_email);
    if (byEmail) return byEmail;
  }
  return repos.contacts.getById(contact.contact_id);
}

export async function resolveLeadContactIdentity(args: {
  repos: LeadPlatformRepos;
  identity: LeadContactIdentity;
  sourceChannel: 'form' | 'email' | 'chat' | 'admin' | 'provider';
  sourceMethod: 'typed' | 'ai_extracted' | 'email_header' | 'detected' | 'provider_sync' | 'system';
  sourceEventId?: string | null;
  occurredAtMs: number;
}): Promise<{
  selectedContact: LeadContact | null;
  identity: LeadContactIdentity;
}> {
  const contact = args.identity.contact;
  if (!contact) return { selectedContact: null, identity: args.identity };

  const phoneMatch = contact.normalized_phone
    ? await args.repos.contacts.findByNormalizedPhone(contact.normalized_phone)
    : null;
  const emailMatch = contact.normalized_email
    ? await args.repos.contacts.findByNormalizedEmail(contact.normalized_email)
    : null;
  const directMatch = await args.repos.contacts.getById(contact.contact_id);
  const selectedContact = phoneMatch ?? emailMatch ?? directMatch ?? contact;
  const hasConflict =
    phoneMatch &&
    emailMatch &&
    phoneMatch.contact_id !== emailMatch.contact_id &&
    selectedContact.contact_id === phoneMatch.contact_id;

  const nextIdentity =
    selectedContact.contact_id === contact.contact_id
      ? args.identity
      : {
          ...args.identity,
          contact: { ...contact, contact_id: selectedContact.contact_id },
          contactPoints: args.identity.contactPoints.map((point) => ({
            ...point,
            contact_id: selectedContact.contact_id,
          })),
          contactObservations: args.identity.contactObservations.map((observation) => ({
            ...observation,
            contact_id: selectedContact.contact_id,
          })),
        };

  if (hasConflict) {
    nextIdentity.contactObservations.push(
      createIdentityConflictObservation({
        contactId: selectedContact.contact_id,
        selectedContactId: selectedContact.contact_id,
        phoneMatchedContactId: phoneMatch?.contact_id ?? null,
        emailMatchedContactId: emailMatch?.contact_id ?? null,
        sourceChannel: args.sourceChannel,
        sourceMethod: args.sourceMethod,
        sourceEventId: args.sourceEventId,
        occurredAtMs: args.occurredAtMs,
      }),
    );
  }

  return { selectedContact, identity: nextIdentity };
}
