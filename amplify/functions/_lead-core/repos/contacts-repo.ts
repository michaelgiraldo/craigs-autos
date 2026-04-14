import type { LeadContact } from '../domain/types.ts';

export interface LeadContactsRepo {
  getById(contactId: string): Promise<LeadContact | null>;
  findByNormalizedPhone(normalizedPhone: string): Promise<LeadContact | null>;
  findByNormalizedEmail(normalizedEmail: string): Promise<LeadContact | null>;
  findByQuoContactId(quoContactId: string): Promise<LeadContact | null>;
  put(contact: LeadContact): Promise<void>;
}
