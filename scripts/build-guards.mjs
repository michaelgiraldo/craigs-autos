import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALE_ORDER, LOCALES, PAGE_PATHS } from '../src/lib/site-data.js';

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

const PARTIAL_LOCALE_PAGE_KEYS = new Set();

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
  const pageKeyMatch = frontmatterMatch[1].match(/^pageKey:\s*['"]?(.+?)['"]?\s*$/m);
  if (!pageKeyMatch) {
    errors.push(`Missing pageKey in ${path.relative(ROOT, filePath)}`);
    return null;
  }
  return pageKeyMatch[1];
}

function buildLocalePageIndex(locale) {
  const localeDir = path.join(CONTENT_ROOT, locale);
  if (!fs.existsSync(localeDir)) {
    return null;
  }
  const map = new Map();
  const files = fs
    .readdirSync(localeDir)
    .filter((entry) => entry.endsWith('.mdx'))
    .map((entry) => path.join(localeDir, entry));

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const pageKey = parsePageKey(filePath, content);
    if (!pageKey) continue;
    map.set(pageKey, { filePath, content });
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

for (const [pageKey, localeMap] of Object.entries(PAGE_PATHS)) {
  const requiredLocales = PARTIAL_LOCALE_PAGE_KEYS.has(pageKey) ? ['en'] : LOCALE_ORDER;
  for (const locale of requiredLocales) {
    const mappedPath = localeMap?.[locale];
    if (!mappedPath) {
      errors.push(`PAGE_PATHS.${pageKey} missing locale mapping: ${locale}`);
      continue;
    }

    const slug = mappedPath === `/${locale}/` ? 'index' : mappedPath.split('/').filter(Boolean).at(-1);
    const contentPath = path.join(CONTENT_ROOT, locale, `${slug}.mdx`);
    const ogPath = path.join(OG_ROOT, locale, `${pageKey}.jpg`);

    assertExists(contentPath, `Content page for ${pageKey} (${locale})`);
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
    .filter((entry) => entry.endsWith('.mdx'))
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
  `Build guards passed: ${LOCALE_ORDER.length} locales, ${Object.keys(PAGE_PATHS).length} page keys, OG/content parity verified.`,
);
