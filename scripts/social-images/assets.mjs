import fs from 'node:fs/promises';
import sharp from 'sharp';
import { FONT_FILES, LOGO_PATH, OUTPUT_ROOT } from './config.mjs';

export async function ensureRequiredFiles() {
  const checks = [
    { label: 'logo', path: LOGO_PATH },
    ...FONT_FILES.map((file) => ({ label: 'font', path: file })),
  ];

  for (const item of checks) {
    try {
      await fs.access(item.path);
    } catch {
      throw new Error(`Missing ${item.label}: ${item.path}`);
    }
  }
}

export async function resetOutputRoot() {
  await fs.rm(OUTPUT_ROOT, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
}

export async function loadLogoDataUri() {
  const logoLargeBuffer = await sharp(LOGO_PATH)
    .resize(560, 560, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return {
    large: `data:image/png;base64,${logoLargeBuffer.toString('base64')}`,
  };
}
