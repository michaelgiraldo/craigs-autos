import type { LeadContact } from './contact.ts';
import type { LeadContactObservation } from './contact-observation.ts';
import type { LeadContactPoint } from './contact-point.ts';
import type { Journey } from './journey.ts';
import type { JourneyEvent } from './journey-event.ts';
import type { LeadRecord } from './lead-record.ts';
import type { ProviderContactProjection } from './provider-contact-projection.ts';

export type JourneyBundle = {
  contact: LeadContact | null;
  contactObservations?: LeadContactObservation[];
  contactPoints?: LeadContactPoint[];
  providerContactProjections?: ProviderContactProjection[];
  journey: Journey;
  leadRecord: LeadRecord | null;
  events: JourneyEvent[];
};
