import type { PageCtaConfig, PageEntry, PageQuotePromptPlacement, PageType } from '../../types/site';

export type ResolvedPageCtaConfig = {
	quotePrompt: PageQuotePromptPlacement;
};

export function resolvePageType(entry: PageEntry): PageType {
	if (entry.data.pageType) {
		return entry.data.pageType;
	}

	if (entry.data.template === 'project') {
		return 'project';
	}

	switch (entry.data.pageKey) {
		case 'home':
			return 'home';
		case 'contact':
			return 'contact';
		case 'requestQuote':
			return 'quote';
		case 'reviews':
			return 'reviews';
		case 'gallery':
			return 'gallery';
		case 'upholsteryGuide':
			return 'guide';
		default:
			return 'service';
	}
}

export function resolvePageCtaConfig(entry: PageEntry): ResolvedPageCtaConfig {
	const pageType = resolvePageType(entry);
	const ctaConfig: PageCtaConfig | undefined = entry.data.ctaConfig;

	return {
		quotePrompt: ctaConfig?.quotePrompt ?? (pageType === 'contact' ? 'inline' : 'none'),
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
