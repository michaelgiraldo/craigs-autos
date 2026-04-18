import type { PageCtaConfig, PageEntry, PageQuotePromptPlacement } from '../../types/site';

export type ResolvedPageCtaConfig = {
	quotePrompt: PageQuotePromptPlacement;
};

export function resolvePageCtaConfig(entry: PageEntry): ResolvedPageCtaConfig {
	const ctaConfig: PageCtaConfig | undefined = entry.data.ctaConfig;

	return {
		quotePrompt: ctaConfig?.quotePrompt ?? (entry.data.pageType === 'contact' ? 'inline' : 'none'),
	};
}

export function resolveReferenceId(value: string | { id: string } | undefined) {
	if (typeof value === 'string') {
		return value;
	}

	if (value?.id) {
		return value.id;
	}

	throw new Error('Missing collection reference id.');
}
