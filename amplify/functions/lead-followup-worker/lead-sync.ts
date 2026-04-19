import type { QuoteRequestRecord } from '../_lead-platform/domain/quote-request.ts';
import type { LeadPlatformRepos } from '../_lead-platform/repos/dynamo.ts';
import { applyLeadFollowupWorkerToLeadRecord } from '../_lead-platform/services/quote-request.ts';
import type { LeadFollowupWorkerDeps } from './types.ts';

export function createLeadFollowupWorkerLeadSync(args: {
  externalIdPrefix: string | null;
  leadTagsFieldKey: string | null;
  leadTagsFieldName: string | null;
  quoApiKey: string;
  repos: LeadPlatformRepos | null;
  source: string | null;
}): LeadFollowupWorkerDeps['syncLeadRecord'] {
  return async (record: QuoteRequestRecord) => {
    if (!args.repos) return;
    await applyLeadFollowupWorkerToLeadRecord({
      repos: args.repos,
      record,
      quoConfig: {
        apiKey: args.quoApiKey,
        leadTagsFieldKey: args.leadTagsFieldKey,
        leadTagsFieldName: args.leadTagsFieldName,
        source: args.source,
        externalIdPrefix: args.externalIdPrefix,
      },
    });
  };
}
