import type { Journey } from '../domain/types.ts';

export type JourneysCursorKey = Record<string, unknown>;

export type JourneysListPageArgs = {
  limit: number;
  cursor?: JourneysCursorKey;
};

export type JourneysListPageResult = {
  items: Journey[];
  lastEvaluatedKey?: JourneysCursorKey;
};

export interface JourneysRepo {
  getById(journeyId: string): Promise<Journey | null>;
  listPage(args: JourneysListPageArgs): Promise<JourneysListPageResult>;
  put(journey: Journey): Promise<void>;
}
