import pageMetaEntries from '../../content/page-meta.json' with { type: 'json' };

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
