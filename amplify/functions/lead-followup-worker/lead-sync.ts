import type { LeadFollowupWorkItem } from '../_lead-platform/domain/lead-followup-work.ts';
import type { LeadPlatformRepos } from '../_lead-platform/repos/dynamo.ts';
import { applyLeadFollowupWorkerToLeadRecord } from '../_lead-platform/services/followup-work.ts';
import type { ProviderReadiness } from '../_lead-platform/services/providers/provider-contracts.ts';
import type { LeadFollowupWorkerDeps } from './types.ts';

export function createLeadFollowupWorkerLeadSync(args: {
  externalIdPrefix: string | null;
  leadTagsFieldKey: string | null;
  leadTagsFieldName: string | null;
  quoApiKey: string;
  readiness: ProviderReadiness;
  repos: LeadPlatformRepos | null;
  source: string | null;
}): LeadFollowupWorkerDeps['syncLeadRecord'] {
  return async (record: LeadFollowupWorkItem) => {
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
        readiness: args.readiness,
      },
    });
  };
}
