import type { LeadContact } from './contact.ts';
import type { Journey } from './journey.ts';
import type { JourneyEvent } from './journey-event.ts';
import type { LeadRecord } from './lead-record.ts';

export type JourneyBundle = {
  contact: LeadContact | null;
  journey: Journey;
  leadRecord: LeadRecord | null;
  events: JourneyEvent[];
};
