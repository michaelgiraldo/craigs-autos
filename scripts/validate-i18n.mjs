import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { LOCALES, LOCALE_ORDER, PAGE_PATHS } from '../src/lib/site-data.js';

const errors = [];
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const localeKeys = Object.keys(LOCALES);
const orderedSet = new Set(LOCALE_ORDER);

if (localeKeys.length !== orderedSet.size || !localeKeys.every((key) => orderedSet.has(key))) {
	errors.push(`LOCALE_ORDER and LOCALES keys must match. LOCALE_ORDER=${LOCALE_ORDER.join(', ')}`);
}

for (const locale of LOCALE_ORDER) {
	const localeMeta = LOCALES[locale];
	if (!localeMeta) {
		errors.push(`Missing LOCALES entry for ${locale}`);
		continue;
	}
	const base = localeMeta.base;
	if (base !== `/${locale}/`) {
		errors.push(`LOCALES.${locale}.base should be "/${locale}/" but is "${base}"`);
	}
	const hreflang = localeMeta.hreflang;
	const hreflangPattern = /^[a-z]{2}(-[A-Za-z]{4})?(-[A-Z]{2})?$/;
	if (!hreflangPattern.test(hreflang)) {
		errors.push(`Invalid hreflang for ${locale}: "${hreflang}"`);
	}
}

for (const [pageKey, localeMap] of Object.entries(PAGE_PATHS)) {
	for (const locale of LOCALE_ORDER) {
		if (!localeMap?.[locale]) {
			errors.push(`PAGE_PATHS.${pageKey} missing locale ${locale}`);
		}
	}
}

const files = await glob('src/content/pages/*/*.mdx');
const pagesByKey = new Map();

for (const file of files) {
	const locale = path.basename(path.dirname(file));
	const slug = path.basename(file, '.mdx');
	const content = fs.readFileSync(file, 'utf-8');

	if (locale !== 'en') {
		const missingLocalePattern = /<LocalizedLink\b(?![^>]*\blocale=)[^>]*\bpageKey=/g;
		if (missingLocalePattern.test(content)) {
			errors.push(
				`LocalizedLink missing locale in ${file}. Add locale="${locale}" to <LocalizedLink> when using pageKey.`,
			);
		}

		const localePath = escapeRegExp(`/${locale}/`);
		const rawPathAsTextPattern = new RegExp(
			`<LocalizedLink[^>]*>\\s*${localePath}[^<]*<\\/LocalizedLink>`,
			'g',
		);
		if (rawPathAsTextPattern.test(content)) {
			errors.push(
				`LocalizedLink uses raw path as link text in ${file}. Replace "/${locale}/..." with readable link text.`,
			);
		}
	}

	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (!frontmatterMatch) {
		errors.push(`Missing frontmatter in ${file}`);
		continue;
	}
	const frontmatter = frontmatterMatch[1];
	const pageKeyMatch = frontmatter.match(/^pageKey:\s*['"]?(.+?)['"]?\s*$/m);
	if (!pageKeyMatch) {
		errors.push(`Missing pageKey in ${file}`);
		continue;
	}
	const pageKey = pageKeyMatch[1];

	if (!LOCALES[locale]) {
		errors.push(`Unknown locale folder "${locale}" in ${file}`);
		continue;
	}

	if (!PAGE_PATHS[pageKey]) {
		errors.push(`Unknown pageKey "${pageKey}" in ${file}`);
		continue;
	}

	const expectedPath = slug === 'index' ? `/${locale}/` : `/${locale}/${slug}/`;
	const mappedPath = PAGE_PATHS[pageKey][locale];
	if (mappedPath !== expectedPath) {
		errors.push(`Path mismatch for ${file}: expected ${expectedPath}, PAGE_PATHS has ${mappedPath}`);
	}

	if (!pagesByKey.has(pageKey)) {
		pagesByKey.set(pageKey, new Set());
	}
	pagesByKey.get(pageKey).add(locale);
}

for (const [pageKey, localeSet] of pagesByKey.entries()) {
	for (const locale of LOCALE_ORDER) {
		if (!localeSet.has(locale)) {
			errors.push(`Missing ${locale} translation for pageKey ${pageKey}`);
		}
	}
}

for (const pageKey of Object.keys(PAGE_PATHS)) {
	if (!pagesByKey.has(pageKey)) {
		errors.push(`No content entries found for pageKey ${pageKey}`);
	}
}

if (errors.length) {
	console.error('i18n validation failed:');
	for (const error of errors) {
		console.error(`- ${error}`);
	}
	process.exit(1);
}

console.log('i18n validation passed.');
