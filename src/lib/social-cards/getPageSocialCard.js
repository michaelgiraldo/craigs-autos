import socialCards from '../../content/social-cards.json' with { type: 'json' };
import { BUSINESS_COPY } from '../site-data.js';
import { getPageTranslation, resolveLocaleKey } from '../site-data/page-registry.js';
import { normalizeSocialText, truncateSocialText } from './text.js';

const SOCIAL_TITLE_MAX_CHARS = 72;
const SOCIAL_DESCRIPTION_MAX_CHARS = 180;
const socialCardByPageKey = new Map(socialCards.map((card) => [card.pageKey, card]));

function getBusinessName(locale) {
	return normalizeSocialText(BUSINESS_COPY[locale]?.name ?? BUSINESS_COPY.en?.name);
}

function includesText(haystack, needle) {
	const normalizedNeedle = normalizeSocialText(needle).toLocaleLowerCase();
	if (!normalizedNeedle) {
		return false;
	}
	return normalizeSocialText(haystack).toLocaleLowerCase().includes(normalizedNeedle);
}

function getImagePath(pageKey, locale) {
	if (getPageTranslation(pageKey, locale)) {
		return `/og/${locale}/${pageKey}.jpg`;
	}
	if (getPageTranslation('home', locale)) {
		return `/og/${locale}/home.jpg`;
	}
	return '/og/en/home.jpg';
}

function buildMetaTitle({ brandName, eyebrow, headline, template }) {
	if (template === 'home') {
		return headline;
	}

	if (template === 'project') {
		return `${headline} · ${brandName}`;
	}

	if (includesText(headline, brandName)) {
		return `${eyebrow} · ${headline}`;
	}

	return `${headline} · ${brandName}`;
}

export function getPageSocialCard({ pageKey = 'home', locale = 'en' } = {}) {
	const resolvedLocale = resolveLocaleKey(locale);
	const resolvedPageKey = pageKey || 'home';
	const entry = socialCardByPageKey.get(resolvedPageKey);

	if (!entry) {
		throw new Error(`Missing social card for pageKey "${resolvedPageKey}".`);
	}

	const localized = entry.locales?.[resolvedLocale];
	if (!localized) {
		throw new Error(`Missing social card locale "${resolvedLocale}" for pageKey "${resolvedPageKey}".`);
	}

	const brandName = getBusinessName(resolvedLocale);
	const eyebrow = normalizeSocialText(localized.eyebrow);
	const headline = normalizeSocialText(localized.headline);
	const summary = normalizeSocialText(localized.summary);
	const title = truncateSocialText(
		buildMetaTitle({
			brandName,
			eyebrow,
			headline,
			template: entry.template,
		}),
		SOCIAL_TITLE_MAX_CHARS,
	);
	const description = truncateSocialText(summary, SOCIAL_DESCRIPTION_MAX_CHARS);
	const imageAlt =
		normalizeSocialText(localized.alt) ||
		(includesText(title, brandName) ? title : `${title} | ${brandName}`);

	return {
		pageKey: resolvedPageKey,
		locale: resolvedLocale,
		template: entry.template,
		title,
		description,
		imagePath: getImagePath(resolvedPageKey, resolvedLocale),
		imageAlt,
		render: {
			eyebrow,
			headline,
			summary,
		},
	};
}

export function getSocialCardEntries() {
	return socialCards;
}
