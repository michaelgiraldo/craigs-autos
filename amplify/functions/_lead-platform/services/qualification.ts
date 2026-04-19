import type { LeadQualificationSnapshot } from '../domain/lead-record.ts';

export function buildDefaultQualificationSnapshot(
  input?: Partial<LeadQualificationSnapshot>,
): LeadQualificationSnapshot {
  return {
    qualified: input?.qualified ?? false,
    qualified_at_ms: input?.qualified_at_ms ?? null,
  };
}
