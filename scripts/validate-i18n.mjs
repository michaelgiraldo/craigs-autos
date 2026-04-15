import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { LOCALES, LOCALE_ORDER } from '../src/lib/site-data.js';
import { getPageKeys, getTranslations } from '../src/lib/site-data/page-registry.js';

// Allow English-first launches for specific pages (translate later).
const PARTIAL_LOCALE_PAGE_KEYS = new Set(['boatUpholstery']);
const errors = [];
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const parseFrontmatter = (content, filePath) => {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    errors.push(`Missing frontmatter in ${filePath}`);
    return null;
  }

  const block = frontmatterMatch[1];
  const readField = (key) => {
    const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    if (!match) {
      errors.push(`Missing ${key} in ${filePath}`);
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
    pageKey: readField('pageKey'),
    locale: readField('locale'),
    slug: readField('slug'),
  };
};

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

const pageKeys = getPageKeys();

for (const pageKey of pageKeys) {
  const translations = getTranslations(pageKey);
  if (PARTIAL_LOCALE_PAGE_KEYS.has(pageKey)) {
    if (!translations?.en) {
      errors.push(`Page manifest for ${pageKey} must include an en path`);
    }
    continue;
  }
  for (const locale of LOCALE_ORDER) {
    if (!translations?.[locale]) {
      errors.push(`Page manifest for ${pageKey} missing locale ${locale}`);
    }
  }
}

const files = await glob('src/content/pages/*/*.{md,mdx}');
const pagesByKey = new Map();

for (const file of files) {
  const folderLocale = path.basename(path.dirname(file));
  const content = fs.readFileSync(file, 'utf-8');
  const frontmatter = parseFrontmatter(content, file);

  if (!frontmatter) {
    continue;
  }

  const { locale, pageKey } = frontmatter;

  if (!locale || !pageKey) {
    continue;
  }

  if (!LOCALES[locale]) {
    errors.push(`Unknown locale "${locale}" in ${file}`);
    continue;
  }

  if (folderLocale !== locale) {
    errors.push(`Locale folder mismatch in ${file}: folder=${folderLocale} frontmatter=${locale}`);
  }

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

  if (!pagesByKey.has(pageKey)) {
    pagesByKey.set(pageKey, new Set());
  }
  pagesByKey.get(pageKey).add(locale);
}

for (const [pageKey, localeSet] of pagesByKey.entries()) {
  if (PARTIAL_LOCALE_PAGE_KEYS.has(pageKey)) {
    if (!localeSet.has('en')) {
      errors.push(`Missing en translation for pageKey ${pageKey}`);
    }
    continue;
  }
  for (const locale of LOCALE_ORDER) {
    if (!localeSet.has(locale)) {
      errors.push(`Missing ${locale} translation for pageKey ${pageKey}`);
    }
  }
}

for (const pageKey of pageKeys) {
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
