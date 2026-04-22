import type { LeadContactObservation } from '../domain/contact-observation.ts';

export interface LeadContactObservationsRepo {
  append(observation: LeadContactObservation): Promise<void>;
  appendMany(observations: LeadContactObservation[]): Promise<void>;
  listByContactId(contactId: string): Promise<LeadContactObservation[]>;
}
