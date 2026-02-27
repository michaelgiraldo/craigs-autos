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

const errors = [];

function assertExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    errors.push(`${label} missing: ${path.relative(ROOT, targetPath)}`);
  }
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
  for (const locale of LOCALE_ORDER) {
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
