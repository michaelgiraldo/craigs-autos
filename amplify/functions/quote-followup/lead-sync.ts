import type { QuoteSubmissionRecord } from '../_lead-core/domain/quote-request.ts';
import type { LeadCoreRepos } from '../_lead-core/repos/dynamo.ts';
import { applyQuoteFollowupToLeadRecord } from '../_lead-core/services/quote-request.ts';
import type { QuoteFollowupDeps } from './types.ts';

export function createQuoteFollowupLeadSync(args: {
  externalIdPrefix: string | null;
  leadTagsFieldKey: string | null;
  leadTagsFieldName: string | null;
  quoApiKey: string;
  repos: LeadCoreRepos | null;
  source: string | null;
}): QuoteFollowupDeps['syncLeadRecord'] {
  return async (record: QuoteSubmissionRecord) => {
    if (!args.repos) return;
    await applyQuoteFollowupToLeadRecord({
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
