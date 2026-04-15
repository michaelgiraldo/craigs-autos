import { LOCALE_ORDER } from './core.js';
import pageMetaEntries from '../../content/page-meta.json' with { type: 'json' };

for (const entry of pageMetaEntries) {
	if (!entry.cardSummary) {
		continue;
	}

	for (const locale of LOCALE_ORDER) {
		if (!entry.cardSummary[locale]) {
			throw new Error(`Missing cardSummary for page "${entry.id}" in locale "${locale}".`);
		}
	}
}

const pageMetaByKey = Object.fromEntries(pageMetaEntries.map((entry) => [entry.id, entry]));

export const PAGE_META = Object.freeze(pageMetaByKey);

export const PAGE_LABELS = Object.freeze(
	pageMetaEntries.reduce((labelsByLocale, entry) => {
		for (const [locale, label] of Object.entries(entry.navLabel ?? {})) {
			labelsByLocale[locale] ??= {};
			labelsByLocale[locale][entry.id] = label;
		}

		return labelsByLocale;
	}, {}),
);

export const PAGE_CARD_SUMMARIES = Object.freeze(
	pageMetaEntries.reduce((summariesByLocale, entry) => {
		for (const [locale, summary] of Object.entries(entry.cardSummary ?? {})) {
			summariesByLocale[locale] ??= {};
			summariesByLocale[locale][entry.id] = summary;
		}

		return summariesByLocale;
	}, {}),
);
