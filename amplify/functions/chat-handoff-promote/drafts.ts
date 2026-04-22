import type { LeadSummaryDraftFields } from '../_lead-platform/services/outreach-drafts.ts';

type BuildLeadSubjectArgs = {
  leadSummary: Pick<LeadSummaryDraftFields, 'vehicle' | 'service' | 'project_summary'> | null;
  threadTitle: string | null;
};

function joinNonEmpty(parts: Array<string | null | undefined>, separator: string): string {
  return parts
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(separator);
}

export function buildLeadEmailSubject(args: BuildLeadSubjectArgs): string {
  const subjectContext = joinNonEmpty(
    [args.leadSummary?.vehicle, args.leadSummary?.service ?? args.leadSummary?.project_summary],
    ' - ',
  );
  if (subjectContext) return `New chat lead: ${subjectContext}`;
  if (args.threadTitle?.trim()) return `New chat lead: ${args.threadTitle.trim()}`;
  return 'New chat lead';
}
