import { LOCALES } from './core.js';
import { PAGE_LABELS } from './page-meta.js';
import {
	getPageEntry,
	getManifestPageKeys,
	getPagePathFromManifest,
	getPageTranslations,
} from './page-manifest.js';

export function resolveLocaleKey(locale) {
	return LOCALES[locale] ? locale : 'en';
}

export function getLocaleMeta(locale) {
	return LOCALES[resolveLocaleKey(locale)] ?? LOCALES.en;
}

export function getTranslations(pageKey) {
	return getPageTranslations(pageKey) ?? getPageTranslations('home') ?? {};
}

export function getPageTranslation(pageKey, locale) {
	const resolvedLocale = resolveLocaleKey(locale);
	return getPagePathFromManifest(pageKey, resolvedLocale) ?? null;
}

export function getPagePath(pageKey, locale) {
	const resolvedLocale = resolveLocaleKey(locale);
	return getPageTranslation(pageKey, resolvedLocale) ?? LOCALES[resolvedLocale]?.base ?? LOCALES.en.base;
}

export function getPageLabel(pageKey, locale) {
	const resolvedLocale = resolveLocaleKey(locale);
	const labels = PAGE_LABELS[resolvedLocale] ?? PAGE_LABELS.en ?? {};
	const fallbackLabels = PAGE_LABELS.en ?? {};
	return labels[pageKey] ?? fallbackLabels[pageKey] ?? getPageEntry(pageKey, resolvedLocale)?.title ?? null;
}

export function getPageKeys() {
	return getManifestPageKeys();
}
