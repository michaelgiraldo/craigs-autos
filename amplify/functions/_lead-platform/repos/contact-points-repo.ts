import type { LeadContactPoint } from '../domain/contact-point.ts';

export interface LeadContactPointsRepo {
  getById(contactPointId: string): Promise<LeadContactPoint | null>;
  findByNormalizedValue(normalizedValue: string): Promise<LeadContactPoint | null>;
  listByContactId(contactId: string): Promise<LeadContactPoint[]>;
  put(contactPoint: LeadContactPoint): Promise<void>;
}
