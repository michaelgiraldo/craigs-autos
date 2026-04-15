import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALE_ORDER, LOCALES } from '../src/lib/site-data.js';
import { getPageKeys, getTranslations } from '../src/lib/site-data/page-registry.js';
import { getPageEntry } from '../src/lib/site-data/page-manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CONTENT_ROOT = path.join(ROOT, 'src/content/pages');
const OG_ROOT = path.join(ROOT, 'public/og');
const PUBLIC_ROOT = path.join(ROOT, 'public');

const TRANSLATION_RATIO_RULES = {
  fa: {
    minRatio: 0.68,
    pageKeys: [
      'home',
      'autoUpholstery',
      'upholsteryGuide',
      'carSeats',
      'headliners',
      'convertibleTops',
      'reviews',
      'contact',
    ],
  },
};

const BANNED_TOKEN_RULES = {
  fa: [
    { label: 'English Text label', pattern: /\[Text\s*\(/u },
    { label: 'English FAQ token', pattern: /\bFAQ\b/u },
    { label: 'English before/after token', pattern: /before\/after/iu },
  ],
  te: [
    { label: 'English Text label', pattern: /\[Text\s*\(/u },
    { label: 'English FAQ token', pattern: /\bFAQ\b/u },
    { label: 'English before/after token', pattern: /before\/after/iu },
    { label: 'English SMS token', pattern: /\bSMS:/u },
  ],
};

const PARTIAL_LOCALE_PAGE_KEYS = new Set(['boatUpholstery']);
const PAGE_FILE_PATTERN = /\.(md|mdx)$/u;

const errors = [];

function assertExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    errors.push(`${label} missing: ${path.relative(ROOT, targetPath)}`);
  }
}

function parsePageKey(filePath, content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    errors.push(`Missing frontmatter in ${path.relative(ROOT, filePath)}`);
    return null;
  }
  const block = frontmatterMatch[1];
  const readField = (key) => {
    const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    if (!match) {
      errors.push(`Missing ${key} in ${path.relative(ROOT, filePath)}`);
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
  };
}

function buildLocalePageIndex(locale) {
  const localeDir = path.join(CONTENT_ROOT, locale);
  if (!fs.existsSync(localeDir)) {
    return null;
  }
  const map = new Map();
  const files = fs
    .readdirSync(localeDir)
    .filter((entry) => PAGE_FILE_PATTERN.test(entry))
    .map((entry) => path.join(localeDir, entry));

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const frontmatter = parsePageKey(filePath, content);
    if (!frontmatter?.pageKey || !frontmatter?.locale) continue;
    if (frontmatter.locale !== locale) {
      errors.push(
        `Locale folder mismatch in ${path.relative(ROOT, filePath)}: folder=${locale} frontmatter=${frontmatter.locale}`,
      );
      continue;
    }
    map.set(frontmatter.pageKey, { filePath, content });
  }

  return map;
}

function contentSignalLength(content) {
  const stripped = content
    .replace(/^---[\s\S]*?---\s*/u, '')
    .replace(/^import\s.+$/gmu, ' ')
    .replace(/^export\sconst\s.+$/gmu, ' ')
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  return stripped.replace(/\s+/gu, '').length;
}

const localeKeySet = new Set(Object.keys(LOCALES));
if (localeKeySet.size !== LOCALE_ORDER.length) {
  errors.push('LOCALE_ORDER must contain each LOCALES key exactly once.');
}
for (const locale of LOCALE_ORDER) {
  if (!localeKeySet.has(locale)) {
    errors.push(`LOCALE_ORDER contains unknown locale: ${locale}`);
  }
}

for (const locale of LOCALE_ORDER) {
  assertExists(path.join(CONTENT_ROOT, locale), 'Content locale directory');
  assertExists(path.join(OG_ROOT, locale), 'OG locale directory');
  assertExists(path.join(PUBLIC_ROOT, locale, 'llms.txt'), 'Locale llms.txt');
}

const pageKeys = getPageKeys();

for (const pageKey of pageKeys) {
  const translations = getTranslations(pageKey);
  const requiredLocales = PARTIAL_LOCALE_PAGE_KEYS.has(pageKey) ? ['en'] : LOCALE_ORDER;
  for (const locale of requiredLocales) {
    const mappedPath = translations?.[locale];
    if (!mappedPath) {
      errors.push(`Page manifest for ${pageKey} missing locale mapping: ${locale}`);
      continue;
    }
    const manifestEntry = getPageEntry(pageKey, locale);
    const ogPath = path.join(OG_ROOT, locale, `${pageKey}.jpg`);

    if (!manifestEntry?.filePath) {
      errors.push(`Page manifest missing file path for ${pageKey} (${locale})`);
    } else {
      assertExists(manifestEntry.filePath, `Content page for ${pageKey} (${locale})`);
    }
    assertExists(ogPath, `OG image for ${pageKey} (${locale})`);
  }
}

const enPageIndex = buildLocalePageIndex('en');
if (!enPageIndex) {
  errors.push('English content directory is missing.');
} else {
  for (const [locale, rule] of Object.entries(TRANSLATION_RATIO_RULES)) {
    const localePageIndex = buildLocalePageIndex(locale);
    if (!localePageIndex) {
      errors.push(`Translation guard locale directory missing: src/content/pages/${locale}`);
      continue;
    }

    for (const pageKey of rule.pageKeys) {
      const enEntry = enPageIndex.get(pageKey);
      if (!enEntry) {
        errors.push(`Translation guard missing English source pageKey: ${pageKey}`);
        continue;
      }
      const localeEntry = localePageIndex.get(pageKey);
      if (!localeEntry) {
        errors.push(`Translation guard missing ${locale} page for pageKey: ${pageKey}`);
        continue;
      }

      const enSignal = contentSignalLength(enEntry.content);
      const localeSignal = contentSignalLength(localeEntry.content);
      if (enSignal === 0) continue;
      const ratio = localeSignal / enSignal;
      if (ratio < rule.minRatio) {
        errors.push(
          `Translation coverage too thin for ${locale}/${pageKey}: ${ratio.toFixed(3)} < ${rule.minRatio} (${path.relative(
            ROOT,
            localeEntry.filePath,
          )})`,
        );
      }
    }
  }
}

for (const [locale, tokenRules] of Object.entries(BANNED_TOKEN_RULES)) {
  const localeDir = path.join(CONTENT_ROOT, locale);
  if (!fs.existsSync(localeDir)) {
    continue;
  }
  const files = fs
    .readdirSync(localeDir)
    .filter((entry) => PAGE_FILE_PATTERN.test(entry))
    .map((entry) => path.join(localeDir, entry));

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const tokenRule of tokenRules) {
      if (tokenRule.pattern.test(content)) {
        errors.push(
          `Mixed-language token (${tokenRule.label}) in ${path.relative(ROOT, filePath)}. Localize this token.`,
        );
      }
    }
  }
}

if (errors.length > 0) {
  console.error('Build guards failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Build guards passed: ${LOCALE_ORDER.length} locales, ${pageKeys.length} page keys, OG/content parity verified.`,
);
