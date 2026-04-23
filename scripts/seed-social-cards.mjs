import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pageMetaEntries from '../src/content/page-meta.json' with { type: 'json' };
import buickProject from '../src/content/projects/buick-eight.json' with { type: 'json' };
import porscheProject from '../src/content/projects/porsche-boxster-s-seat-project.json' with {
  type: 'json',
};
import skeeterProject from '../src/content/projects/skeeter-boat-upholstery-marine-carpet-installation.json' with {
  type: 'json',
};
import { BUSINESS_COPY, LOCALE_ORDER, NAV_LABELS } from '../src/lib/site-data.js';
import { getManifestPageKeys, getPageEntry } from '../src/lib/site-data/page-manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT, 'src/content/social-cards.json');

const TEMPLATE_BY_PAGE_KEY = {
  home: 'home',
  autoUpholstery: 'service',
  boatUpholstery: 'service',
  carSeats: 'service',
  classicCars: 'service',
  commercialFleet: 'service',
  convertibleTops: 'service',
  headliners: 'service',
  motorcycleSeats: 'service',
  gallery: 'gallery',
  reviews: 'review',
  contact: 'contact',
  requestQuote: 'quote',
  upholsteryGuide: 'guide',
  buickEight: 'project',
  porscheBoxsterSSeatProject: 'project',
  skeeterBoatUpholsteryMarineCarpetInstallation: 'project',
};

const PROJECT_BY_PAGE_KEY = {
  buickEight: buickProject,
  porscheBoxsterSSeatProject: porscheProject,
  skeeterBoatUpholsteryMarineCarpetInstallation: skeeterProject,
};

const PROJECT_ENGLISH_OVERRIDES = {
  buickEight: {
    eyebrow: 'Classic Interior Project',
    headline: 'Buick Eight Restoration',
    summary: 'Two-tone upholstery, headliner, carpet, and trunk finish.',
  },
  porscheBoxsterSSeatProject: {
    eyebrow: 'Seat Project',
    headline: 'Porsche Boxster S',
    summary: 'Saddle leather bolsters, houndstooth inserts, matched door panels.',
  },
  skeeterBoatUpholsteryMarineCarpetInstallation: {
    eyebrow: 'Boat Project',
    headline: 'Skeeter Boat',
    summary: 'Shop-built reupholstered seats, foam support, and new marine carpet installed.',
  },
};

function text(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function localized(map, locale) {
  return text(map?.[locale] ?? map?.en);
}

function businessName(locale) {
  return text(BUSINESS_COPY[locale]?.name ?? BUSINESS_COPY.en?.name);
}

function pageMetaByKey() {
  return new Map(pageMetaEntries.map((entry) => [entry.id, entry]));
}

function buildProjectLocale({ pageKey, project, locale }) {
  const copy = project.copy;
  const localizedBusinessName = businessName(locale);
  const override = locale === 'en' ? PROJECT_ENGLISH_OVERRIDES[pageKey] : null;
  const eyebrow = override?.eyebrow ?? localized(copy.featuredKicker, locale);
  const headline =
    override?.headline ??
    (pageKey === 'porscheBoxsterSSeatProject'
      ? 'Porsche Boxster S'
      : localized(copy.title, locale).replace(/\s+Interior\s+Restoration$/iu, ' Restoration'));
  const summary = override?.summary ?? localized(copy.lead, locale);

  return {
    eyebrow,
    headline,
    summary,
    alt: `${headline} | ${localizedBusinessName}`,
  };
}

function buildStandardLocale({ entry, locale, pageKey }) {
  const localizedBusinessName = businessName(locale);
  const nav = NAV_LABELS[locale] ?? NAV_LABELS.en ?? {};
  const eyebrow =
    pageKey === 'home'
      ? text(nav.services) || localized(entry?.navLabel, locale)
      : localized(entry?.navLabel, locale);
  const headline = localizedBusinessName;
  const manifestEntry = getPageEntry(pageKey, locale);
  const summary =
    localized(entry?.cardSummary, locale) ||
    text(manifestEntry?.description) ||
    text(BUSINESS_COPY[locale]?.description) ||
    text(BUSINESS_COPY.en?.description);

  return {
    eyebrow,
    headline,
    summary,
    alt: `${eyebrow} | ${localizedBusinessName}`,
  };
}

async function main() {
  const metaByKey = pageMetaByKey();
  const cards = [];

  for (const pageKey of getManifestPageKeys()) {
    const template = TEMPLATE_BY_PAGE_KEY[pageKey];
    if (!template) {
      throw new Error(`Missing social-card template mapping for pageKey "${pageKey}".`);
    }

    const project = PROJECT_BY_PAGE_KEY[pageKey];
    const meta = metaByKey.get(pageKey);
    const locales = {};

    for (const locale of LOCALE_ORDER) {
      locales[locale] = project
        ? buildProjectLocale({ pageKey, project, locale })
        : buildStandardLocale({ entry: meta, locale, pageKey });
    }

    cards.push({
      pageKey,
      template,
      locales,
    });
  }

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(cards, null, 2)}\n`, 'utf8');
  console.log(`Seeded ${cards.length} social cards in ${path.relative(ROOT, OUTPUT_PATH)}.`);
}

main().catch((error) => {
  console.error(`Social card seed failed: ${error.message}`);
  process.exit(1);
});
