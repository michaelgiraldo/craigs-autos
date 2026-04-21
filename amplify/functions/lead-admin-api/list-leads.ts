import { encodeCursor } from './request.ts';
import type { LeadAdminDeps, LeadAdminListRequest } from './types.ts';

export async function listLeadAdminPage(deps: LeadAdminDeps, request: LeadAdminListRequest) {
  const nowEpochSeconds = Math.floor(deps.nowEpochMs() / 1000);
  const [recordsResult, journeysResult, followupResult] = await Promise.all([
    deps.listLeadRecords({
      limit: request.limit,
      qualifiedFilter: request.qualifiedFilter,
      cursor: request.recordsCursor,
    }),
    deps.listJourneys({
      limit: request.limit,
      cursor: request.journeysCursor,
    }),
    deps.listFollowupWork({
      limit: request.limit,
      nowEpochSeconds,
    }),
  ]);

  return {
    lead_records: Array.isArray(recordsResult.items) ? recordsResult.items : [],
    journeys: Array.isArray(journeysResult.items) ? journeysResult.items : [],
    followup_work: Array.isArray(followupResult.items) ? followupResult.items : [],
    next_records_cursor: encodeCursor(recordsResult.lastEvaluatedKey),
    next_journeys_cursor: encodeCursor(journeysResult.lastEvaluatedKey),
  };
}
