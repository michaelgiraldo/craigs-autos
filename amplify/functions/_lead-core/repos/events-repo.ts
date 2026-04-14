import type { JourneyEvent } from '../domain/types.ts';

export interface JourneyEventsRepo {
  getBySortKey(journeyId: string, eventSortKey: string): Promise<JourneyEvent | null>;
  append(event: JourneyEvent): Promise<void>;
  appendMany(events: JourneyEvent[]): Promise<void>;
  listByJourneyId(journeyId: string): Promise<JourneyEvent[]>;
  listByLeadRecordId(leadRecordId: string): Promise<JourneyEvent[]>;
  scanPage(args: {
    limit: number;
    cursor?: Record<string, unknown>;
  }): Promise<{ items: JourneyEvent[]; lastEvaluatedKey?: Record<string, unknown> }>;
}
