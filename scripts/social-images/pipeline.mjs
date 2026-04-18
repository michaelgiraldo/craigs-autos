import path from 'node:path';
import { ensureRequiredFiles, loadLogoDataUri, resetOutputRoot } from './assets.mjs';
import { OUTPUT_ROOT, ROOT } from './config.mjs';
import { collectEntries } from './entries.mjs';
import { renderImage } from './render-image.mjs';

export async function generateSocialImages() {
  await ensureRequiredFiles();

  const entries = collectEntries();
  if (entries.length === 0) {
    throw new Error('No localized page entries were found for social image generation.');
  }

  await resetOutputRoot();
  const logoDataUri = await loadLogoDataUri();

  for (const entry of entries) {
    await renderImage({ entry, logoDataUri });
  }

  const locales = new Set(entries.map((entry) => entry.locale));
  console.log(
    `Generated ${entries.length} localized social preview images across ${locales.size} locales in ${path.relative(
      ROOT,
      OUTPUT_ROOT,
    )}.`,
  );
}
