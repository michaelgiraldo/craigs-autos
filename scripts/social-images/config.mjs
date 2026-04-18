import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT = path.resolve(__dirname, '../..');
export const OUTPUT_ROOT = path.join(ROOT, 'public/og');
export const LOGO_PATH = path.join(
  ROOT,
  'src/assets/brand/craigs-auto-upholstery-logo-transparent.png',
);

export const WIDTH = 1200;
export const HEIGHT = 630;

export const FONT_FILES = [
  path.join(ROOT, 'scripts/og-fonts/NotoSans-Regular.ttf'),
  path.join(ROOT, 'scripts/og-fonts/NotoSansArabic-Regular.ttf'),
  path.join(ROOT, 'scripts/og-fonts/NotoSansDevanagari-Regular.ttf'),
  path.join(ROOT, 'scripts/og-fonts/NotoSansTamil-Regular.ttf'),
  path.join(ROOT, 'scripts/og-fonts/NotoSansCJK-Regular.ttc'),
];
