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
	};
};

const listPageFiles = () => {
	const localeDirs = fs
		.readdirSync(CONTENT_ROOT, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right, 'en'));

	const pageFiles = [];

	for (const locale of localeDirs) {
		const localeDir = path.join(CONTENT_ROOT, locale);
		const localeFiles = fs
			.readdirSync(localeDir, { withFileTypes: true })
			.filter((entry) => entry.isFile() && PAGE_FILE_PATTERN.test(entry.name))
			.map((entry) => entry.name)
			.sort((left, right) => left.localeCompare(right, 'en'));

		for (const fileName of localeFiles) {
			const filePath = path.join(localeDir, fileName);
			pageFiles.push({ locale, fileName, filePath });
		}
	}

	return pageFiles;
};

const getManifestSignature = (pageFiles) =>
	pageFiles
		.map(({ filePath }) => {
			const stats = fs.statSync(filePath);
			return `${filePath}:${stats.mtimeMs}`;
		})
		.join('|');

const buildPageManifest = (pageFiles) => {
	const manifestByKey = {};
	const entries = [];

	for (const { locale, fileName, filePath } of pageFiles) {
			const content = fs.readFileSync(filePath, 'utf-8');
			const frontmatter = parseFrontmatter(content, filePath);
			const pageKey = frontmatter.pageKey;

			if (!pageKey) {
				throw new Error(`Missing pageKey in ${filePath}`);
			}

			const slug = fileName.replace(PAGE_FILE_PATTERN, '');
			const pagePath = slug === 'index' ? `/${locale}/` : `/${locale}/${slug}/`;
			const entry = {
				locale,
				slug,
				path: pagePath,
				pageKey,
				title: frontmatter.title,
				description: frontmatter.description,
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
	return getManifestState().entries;
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
