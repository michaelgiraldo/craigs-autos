import type { LeadContact } from '../domain/contact.ts';
import type { LeadCoreRepos } from '../repos/dynamo.ts';

export async function findExistingContact(
  repos: LeadCoreRepos,
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
