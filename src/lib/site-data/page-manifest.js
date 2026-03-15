import fs from 'node:fs';
import path from 'node:path';
import { LOCALE_ORDER, LOCALES } from './core.js';

const CONTENT_ROOT = path.resolve(process.cwd(), 'src/content/pages');
const PAGE_FILE_PATTERN = /\.(md|mdx)$/u;
const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---/u;
let cachedSignature = null;
let cachedManifestState = null;

const parseFrontmatter = (content, filePath) => {
	const frontmatterMatch = content.match(FRONTMATTER_PATTERN);
	if (!frontmatterMatch) {
		throw new Error(`Missing frontmatter in ${filePath}`);
	}

	const block = frontmatterMatch[1];
	const readField = (key) => {
		const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'mu'));
		if (!match) {
			return null;
		}

		let value = match[1].trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		return value.replaceAll('\\"', '"').replaceAll("\\'", "'").trim();
	};

	return {
		title: readField('title'),
		description: readField('description'),
		pageKey: readField('pageKey'),
		locale: readField('locale'),
		slug: readField('slug'),
	};
};

const listPageFiles = (dir = CONTENT_ROOT) => {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const pageFiles = [];

	for (const entry of entries) {
		const entryPath = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			pageFiles.push(...listPageFiles(entryPath));
			continue;
		}

		if (entry.isFile() && PAGE_FILE_PATTERN.test(entry.name)) {
			pageFiles.push(entryPath);
		}
	}

	return pageFiles.sort((left, right) => left.localeCompare(right, 'en'));
};

const getManifestSignature = (pageFiles) =>
	pageFiles
		.map((filePath) => {
			const stats = fs.statSync(filePath);
			return `${filePath}:${stats.mtimeMs}`;
		})
		.join('|');

const buildPagePath = (locale, slug) => (slug === 'index' ? `/${locale}/` : `/${locale}/${slug}/`);

const buildPageManifest = (pageFiles) => {
	const manifestByKey = {};
	const entries = [];

	for (const filePath of pageFiles) {
		const content = fs.readFileSync(filePath, 'utf-8');
		const frontmatter = parseFrontmatter(content, filePath);
		const { description, locale, pageKey, slug, title } = frontmatter;

		if (!pageKey) {
			throw new Error(`Missing pageKey in ${filePath}`);
		}

		if (!locale) {
			throw new Error(`Missing locale in ${filePath}`);
		}

		if (!LOCALES[locale]) {
			throw new Error(`Unknown locale "${locale}" in ${filePath}`);
		}

		if (!slug) {
			throw new Error(`Missing slug in ${filePath}`);
		}

		const entry = {
			locale,
			slug,
			path: buildPagePath(locale, slug),
			pageKey,
			title,
			description,
			filePath,
		};

		manifestByKey[pageKey] ??= { key: pageKey, locales: {} };
		if (manifestByKey[pageKey].locales[locale]) {
			throw new Error(`Duplicate localized page for ${pageKey}/${locale}: ${filePath}`);
		}

		manifestByKey[pageKey].locales[locale] = entry;
		entries.push(entry);
	}

	return {
		byKey: manifestByKey,
		entries,
	};
};

const getManifestState = () => {
	const pageFiles = listPageFiles();
	const signature = getManifestSignature(pageFiles);

	if (signature === cachedSignature && cachedManifestState) {
		return cachedManifestState;
	}

	cachedManifestState = buildPageManifest(pageFiles);
	cachedSignature = signature;
	return cachedManifestState;
};

export function getPageManifest() {
	return getManifestState().byKey;
}

export function getManifestPageKeys() {
	return Object.keys(getPageManifest()).sort((left, right) => left.localeCompare(right, 'en'));
}

export function getManifestPageEntries() {
	return [...getManifestState().entries].sort((left, right) =>
		`${left.locale}/${left.pageKey}`.localeCompare(`${right.locale}/${right.pageKey}`, 'en'),
	);
}

export function getPageLocales(pageKey) {
	return getPageManifest()[pageKey]?.locales ?? null;
}

export function getPageEntry(pageKey, locale) {
	return getPageLocales(pageKey)?.[locale] ?? null;
}

export function getPageTranslations(pageKey) {
	const locales = getPageLocales(pageKey);
	if (!locales) {
		return null;
	}

	return Object.fromEntries(
		LOCALE_ORDER.filter((locale) => Boolean(locales[locale])).map((locale) => [
			locale,
			locales[locale].path,
		]),
	);
}

export function getPagePathFromManifest(pageKey, locale) {
	return getPageEntry(pageKey, locale)?.path ?? null;
}

export function getLocalizedPageEntries(locale) {
	const resolvedLocale = LOCALES[locale] ? locale : 'en';
	return getManifestPageEntries().filter((entry) => entry.locale === resolvedLocale);
}
