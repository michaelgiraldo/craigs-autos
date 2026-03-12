import { LOCALES } from './core.js';
import { NAV_LABELS } from './nav-labels.js';
import { PAGE_PATHS } from './page-paths.js';

export function resolveLocaleKey(locale) {
	return LOCALES[locale] ? locale : 'en';
}

export function getLocaleMeta(locale) {
	return LOCALES[resolveLocaleKey(locale)] ?? LOCALES.en;
}

export function getTranslations(pageKey) {
	return PAGE_PATHS[pageKey] ?? PAGE_PATHS.home;
}

export function getPageTranslation(pageKey, locale) {
	const resolvedLocale = resolveLocaleKey(locale);
	const translations = getTranslations(pageKey);
	return translations[resolvedLocale] ?? null;
}

export function getPagePath(pageKey, locale) {
	const resolvedLocale = resolveLocaleKey(locale);
	return getPageTranslation(pageKey, resolvedLocale) ?? LOCALES[resolvedLocale]?.base ?? LOCALES.en.base;
}

export function getPageLabel(pageKey, locale) {
	const resolvedLocale = resolveLocaleKey(locale);
	const labels = NAV_LABELS[resolvedLocale] ?? NAV_LABELS.en ?? {};
	const fallbackLabels = NAV_LABELS.en ?? {};
	return labels[pageKey] ?? fallbackLabels[pageKey] ?? null;
}
