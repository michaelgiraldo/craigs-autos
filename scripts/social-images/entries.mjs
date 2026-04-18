import { getManifestPageEntries } from '../../src/lib/site-data/page-manifest.js';

export function collectEntries() {
  const dedupe = new Set();
  const entries = getManifestPageEntries().map(({ locale, pageKey }) => ({ locale, pageKey }));

  for (const entry of entries) {
    const dedupeKey = `${entry.locale}/${entry.pageKey}`;
    if (dedupe.has(dedupeKey)) {
      throw new Error(`Duplicate pageKey for locale found: ${dedupeKey}`);
    }
    dedupe.add(dedupeKey);
  }

  return entries.sort((a, b) =>
    `${a.locale}/${a.pageKey}`.localeCompare(`${b.locale}/${b.pageKey}`),
  );
}
