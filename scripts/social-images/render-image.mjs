import fs from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { getPageSocialCard } from '../../src/lib/social-cards/getPageSocialCard.js';
import { FONT_FILES, HEIGHT, OUTPUT_ROOT, WIDTH } from './config.mjs';
import { buildSvg } from './svg-card.mjs';

export async function renderImage({ entry, logoDataUri }) {
  const card = getPageSocialCard(entry);
  const svg = buildSvg({
    card,
    logoLargeDataUri: logoDataUri.large,
  });

  const overlay = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
    font: {
      fontFiles: FONT_FILES,
      loadSystemFonts: true,
      defaultFontFamily: 'Noto Sans',
    },
  }).render();

  const outputDir = path.join(OUTPUT_ROOT, entry.locale);
  const outputPath = path.join(outputDir, `${entry.pageKey}.jpg`);
  await fs.mkdir(outputDir, { recursive: true });

  await sharp(overlay.asPng())
    .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toFile(outputPath);

  const metadata = await sharp(outputPath).metadata();
  if (metadata.width !== WIDTH || metadata.height !== HEIGHT) {
    throw new Error(
      `Unexpected dimensions for ${outputPath}: ${metadata.width}x${metadata.height} (expected ${WIDTH}x${HEIGHT})`,
    );
  }
}
