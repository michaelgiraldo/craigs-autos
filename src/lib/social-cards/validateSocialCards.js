import { LOCALE_ORDER, LOCALES } from '../site-data.js';
import { getPageKeys, getTranslations } from '../site-data/page-registry.js';
import { getPageSocialCard, getSocialCardEntries } from './getPageSocialCard.js';
import { normalizeSocialText, visualUnits } from './text.js';

const VALID_TEMPLATES = new Set([
	'home',
	'service',
	'project',
	'gallery',
	'review',
	'contact',
	'quote',
	'guide',
]);

const VISUAL_LIMITS = {
	eyebrow: 54,
	headline: 74,
	summary: 190,
};

function validateTextField({ errors, field, locale, pageKey, value }) {
	const text = normalizeSocialText(value);
	if (!text) {
		errors.push(`Social card ${pageKey}/${locale} missing ${field}.`);
		return;
	}

	if (text.includes('|')) {
		errors.push(`Social card ${pageKey}/${locale} ${field} contains SEO pipe separator.`);
	}

	const units = visualUnits(text);
	if (units > VISUAL_LIMITS[field]) {
		errors.push(
			`Social card ${pageKey}/${locale} ${field} is too long for the visual system: ${units.toFixed(
				1,
			)} > ${VISUAL_LIMITS[field]}.`,
		);
	}
}

export function validateSocialCards() {
	const errors = [];
	const localeKeys = new Set(Object.keys(LOCALES));
	const pageKeys = getPageKeys();
	const pageKeySet = new Set(pageKeys);
	const entries = getSocialCardEntries();
	const seenPageKeys = new Set();

	for (const entry of entries) {
		if (!entry.pageKey) {
			errors.push('Social card entry missing pageKey.');
			continue;
		}
		if (seenPageKeys.has(entry.pageKey)) {
			errors.push(`Duplicate social card entry for pageKey "${entry.pageKey}".`);
		}
		seenPageKeys.add(entry.pageKey);

		if (!pageKeySet.has(entry.pageKey)) {
			errors.push(`Social card references unknown pageKey "${entry.pageKey}".`);
		}

		if (!VALID_TEMPLATES.has(entry.template)) {
			errors.push(`Social card ${entry.pageKey} has invalid template "${entry.template}".`);
		}

		for (const locale of LOCALE_ORDER) {
			if (!localeKeys.has(locale)) {
				errors.push(`Social card validation saw unknown LOCALE_ORDER key "${locale}".`);
				continue;
			}

			const localized = entry.locales?.[locale];
			if (!localized) {
				errors.push(`Social card ${entry.pageKey} missing locale "${locale}".`);
				continue;
			}

			for (const field of ['eyebrow', 'headline', 'summary']) {
				validateTextField({
					errors,
					field,
					locale,
					pageKey: entry.pageKey,
					value: localized[field],
				});
			}
		}
	}

	for (const pageKey of pageKeys) {
		if (!seenPageKeys.has(pageKey)) {
			errors.push(`Page manifest pageKey "${pageKey}" is missing a social card.`);
			continue;
		}

		const translations = getTranslations(pageKey);
		for (const locale of LOCALE_ORDER) {
			if (!translations?.[locale]) {
				errors.push(`Page manifest for ${pageKey} missing locale mapping: ${locale}`);
				continue;
			}

			try {
				const socialCard = getPageSocialCard({ pageKey, locale });
				if (!socialCard.title) {
					errors.push(`Social card ${pageKey}/${locale} missing meta title.`);
				}
				if (!socialCard.description) {
					errors.push(`Social card ${pageKey}/${locale} missing meta description.`);
				}
				if (!socialCard.imagePath) {
					errors.push(`Social card ${pageKey}/${locale} missing image path.`);
				}
				if (!socialCard.imageAlt) {
					errors.push(`Social card ${pageKey}/${locale} missing image alt.`);
				}
			} catch (error) {
				errors.push(error.message);
			}
		}
	}

	return errors;
}
