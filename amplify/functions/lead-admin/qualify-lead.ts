import type { LeadAdminDeps, LeadQualificationRequest } from './types.ts';

export async function qualifyLeadRecord(
  deps: LeadAdminDeps,
  request: LeadQualificationRequest,
): Promise<{ found: boolean; qualifiedAtMs: number }> {
  const qualifiedAtMs = deps.nowEpochMs();
  const found = await deps.updateLeadRecordQualification({
    leadRecordId: request.leadRecordId,
    qualified: request.qualified,
    qualifiedAtMs,
  });

  return { found, qualifiedAtMs };
}
