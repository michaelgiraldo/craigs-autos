import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { LOCALES, NAV_LABELS, BUSINESS_COPY, BRAND_NAME } from '../src/lib/site-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CONTENT_ROOT = path.join(ROOT, 'src/content/pages');
const OUTPUT_ROOT = path.join(ROOT, 'public/og');
const LOGO_PATH = path.join(ROOT, 'src/assets/brand/craigs-auto-upholstery-logo-transparent.png');

const WIDTH = 1200;
const HEIGHT = 630;

const FONT_FILES = [
  path.join(ROOT, 'scripts/og-fonts/NotoSans-Regular.ttf'),
  path.join(ROOT, 'scripts/og-fonts/NotoSansArabic-Regular.ttf'),
  path.join(ROOT, 'scripts/og-fonts/NotoSansDevanagari-Regular.ttf'),
  path.join(ROOT, 'scripts/og-fonts/NotoSansTamil-Regular.ttf'),
  path.join(ROOT, 'scripts/og-fonts/NotoSansCJK-Regular.ttc'),
];

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOgTitle(value) {
  let output = normalizeText(value);
  output = output.replace(/\s*[|·•-]\s*Craig['’]s(?:\s+Auto\s+Upholstery)?$/iu, '');
  output = output.replace(/\s*\|\s*/g, ' · ');
  return output.trim();
}

function buildCardCopy(entry) {
  const nav = NAV_LABELS[entry.locale] ?? NAV_LABELS.en;
  const business = BUSINESS_COPY[entry.locale] ?? BUSINESS_COPY.en;
  const pageLabel =
    entry.pageKey === 'home'
      ? normalizeText(nav?.services) || normalizeText(nav?.home) || normalizeOgTitle(entry.title)
      : normalizeText(nav?.[entry.pageKey]) || normalizeOgTitle(entry.title);

  return {
    brandHeadline: normalizeText(business?.name) || BRAND_NAME,
    serviceLabel: pageLabel,
    description: normalizeText(business?.description) || normalizeText(entry.description),
  };
}

function charUnits(char) {
  if (/\s/.test(char)) {
    return 0.4;
  }
  if (
    /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u.test(
      char,
    )
  ) {
    return 1.7;
  }
  return 1;
}

function trimToUnits(input, maxUnits) {
  let output = '';
  let units = 0;
  for (const char of Array.from(input)) {
    const next = charUnits(char);
    if (units + next > maxUnits) {
      break;
    }
    output += char;
    units += next;
  }
  return output.trimEnd();
}

function sumUnits(input) {
  return Array.from(input).reduce((total, char) => total + charUnits(char), 0);
}

function appendEllipsis(input, maxUnits) {
  const safeUnits = Math.max(1, maxUnits - 1);
  const trimmed = trimToUnits(input, safeUnits).replace(/[\s|·•,.;:!?，。！？、：；-]+$/u, '');
  return `${trimmed}...`;
}

function wrapByCharacters(text, maxUnits, maxLines) {
  const chars = Array.from(text);
  const lines = [];
  let line = '';
  let lineUnits = 0;
  let i = 0;

  for (; i < chars.length; i += 1) {
    const char = chars[i];
    const units = charUnits(char);

    if (line && lineUnits + units > maxUnits) {
      lines.push(line.trimEnd());
      line = '';
      lineUnits = 0;
      if (lines.length === maxLines) {
        break;
      }
      if (char === ' ') {
        continue;
      }
    }

    line += char;
    lineUnits += units;
  }

  if (lines.length < maxLines && line.trim().length > 0) {
    lines.push(line.trimEnd());
  }

  if (i < chars.length && lines.length > 0) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = appendEllipsis(lines[lastIndex], maxUnits);
  }

  return lines.slice(0, maxLines);
}

function wrapByWords(text, maxUnits, maxLines) {
  const lines = [];
  const words = text.split(' ').filter(Boolean);
  let index = 0;

  while (index < words.length && lines.length < maxLines) {
    let line = '';

    while (index < words.length) {
      const word = words[index];
      const candidate = line ? `${line} ${word}` : word;

      if (sumUnits(candidate) <= maxUnits) {
        line = candidate;
        index += 1;
        continue;
      }

      // Very long tokens (rare for this content) are split safely.
      if (!line) {
        const chunk = trimToUnits(word, maxUnits);
        if (!chunk) {
          index += 1;
          break;
        }

        line = chunk;
        const wordChars = Array.from(word);
        const consumedChars = Array.from(chunk).length;
        const remainder = wordChars.slice(consumedChars).join('');
        if (remainder) {
          words[index] = remainder;
        } else {
          index += 1;
        }
      }

      break;
    }

    if (!line) {
      break;
    }

    lines.push(line.trimEnd());
  }

  if (index < words.length && lines.length > 0) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = appendEllipsis(lines[lastIndex], maxUnits);
  }

  return lines;
}

function wrapText(input, maxUnits, maxLines) {
  const text = normalizeText(input);
  if (!text) {
    return [];
  }

  const hasSpaces = /\s/u.test(text);
  if (!hasSpaces) {
    return wrapByCharacters(text, maxUnits, maxLines);
  }

  return wrapByWords(text, maxUnits, maxLines);
}

function parseFrontmatter(raw, filePath) {
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!frontmatterMatch) {
    throw new Error(`Missing frontmatter in ${filePath}`);
  }

  const block = frontmatterMatch[1];
  const parseField = (key) => {
    const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    if (!match) {
      throw new Error(`Missing "${key}" in ${filePath}`);
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
    title: parseField('title'),
    description: parseField('description'),
    pageKey: parseField('pageKey'),
  };
}

function buildSvg({
  brandHeadline,
  serviceLabel,
  description,
  localeLabel,
  logoSmallDataUri,
  logoLargeDataUri,
}) {
  const headingChars = Array.from(brandHeadline).length;
  let headingSize = 78;
  let headingUnits = 18;
  if (headingChars > 24) {
    headingSize = 68;
    headingUnits = 22;
  }
  if (headingChars > 34) {
    headingSize = 60;
    headingUnits = 25;
  }
  if (headingChars > 46) {
    headingSize = 52;
    headingUnits = 30;
  }

  const serviceChars = Array.from(serviceLabel).length;
  let serviceSize = 42;
  let serviceUnits = 28;
  if (serviceChars > 26) {
    serviceSize = 36;
    serviceUnits = 32;
  }
  if (serviceChars > 38) {
    serviceSize = 32;
    serviceUnits = 36;
  }

  const descriptionChars = Array.from(description).length;
  let descriptionSize = 30;
  let descriptionUnits = 50;
  if (descriptionChars > 160) {
    descriptionSize = 27;
    descriptionUnits = 56;
  }

  const serviceLines = wrapText(serviceLabel, serviceUnits, 2);
  const headingLines = wrapText(brandHeadline, headingUnits, 2);
  const descriptionLines = wrapText(description, descriptionUnits, 2);

  const serviceLineHeight = Math.round(serviceSize * 1.2);
  const headingLineHeight = Math.round(headingSize * 1.08);
  const descriptionLineHeight = Math.round(descriptionSize * 1.27);

  const contentX = 84;
  const serviceStartY = 194;
  const headingStartY = serviceStartY + serviceLines.length * serviceLineHeight + 42;
  const descriptionStartY = headingStartY + headingLines.length * headingLineHeight + 36;
  const localeChipWidth = Math.min(440, Math.max(148, Array.from(localeLabel).length * 18 + 44));

  const serviceText = serviceLines
    .map(
      (line, index) =>
        `<text x="${contentX}" y="${serviceStartY + index * serviceLineHeight}" class="service">${escapeXml(line)}</text>`,
    )
    .join('');

  const headingText = headingLines
    .map(
      (line, index) =>
        `<text x="${contentX}" y="${headingStartY + index * headingLineHeight}" class="title">${escapeXml(line)}</text>`,
    )
    .join('');

  const descriptionText = descriptionLines
    .map(
      (line, index) =>
        `<text x="${contentX}" y="${descriptionStartY + index * descriptionLineHeight}" class="description">${escapeXml(line)}</text>`,
    )
    .join('');

  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="og-bg" x1="0" y1="0" x2="${WIDTH}" y2="${HEIGHT}" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="#04122d" />
    <stop offset="48%" stop-color="#0a2a52" />
    <stop offset="100%" stop-color="#041228" />
  </linearGradient>
	  <radialGradient id="og-glow-orange" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1020 120) rotate(130) scale(520 420)">
	    <stop offset="0%" stop-color="#f97316" stop-opacity="0.28" />
	    <stop offset="100%" stop-color="#f97316" stop-opacity="0" />
	  </radialGradient>
	  <radialGradient id="og-glow-blue" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(850 525) rotate(145) scale(520 360)">
	    <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.2" />
	    <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0" />
	  </radialGradient>
	  <linearGradient id="og-left-scrim" x1="0" y1="0" x2="820" y2="0" gradientUnits="userSpaceOnUse">
	    <stop offset="0%" stop-color="#020617" stop-opacity="0.9" />
	    <stop offset="58%" stop-color="#020617" stop-opacity="0.5" />
	    <stop offset="100%" stop-color="#020617" stop-opacity="0.06" />
	  </linearGradient>
	  <clipPath id="og-logo-trim">
	    <circle cx="910" cy="294" r="223" />
	  </clipPath>
	  <linearGradient id="og-accent" x1="${contentX}" y1="0" x2="${contentX + 460}" y2="0" gradientUnits="userSpaceOnUse">
	    <stop offset="0%" stop-color="#fb923c" />
	    <stop offset="100%" stop-color="#f97316" />
	  </linearGradient>
  <style>
    .service {
      fill: #fb923c;
      font-family: 'Noto Sans', sans-serif;
      font-size: ${serviceSize}px;
      font-weight: 700;
      letter-spacing: -0.005em;
    }
    .title {
      fill: #ffffff;
      font-family: 'Noto Sans', sans-serif;
      font-size: ${headingSize}px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .description {
      fill: #e2e8f0;
      font-family: 'Noto Sans', sans-serif;
      font-size: ${descriptionSize}px;
      font-weight: 500;
      letter-spacing: -0.005em;
    }
    .brand {
      fill: #f8fafc;
      font-family: 'Noto Sans', sans-serif;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .chip {
      fill: #0f172acc;
      stroke: #ffffff52;
      stroke-width: 2;
    }
    .chip-label {
      fill: #f8fafc;
      font-family: 'Noto Sans', sans-serif;
      font-size: 23px;
      font-weight: 600;
      letter-spacing: 0.01em;
    }
    .domain {
      fill: #d1d5db;
      font-family: 'Noto Sans', sans-serif;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }
  </style>
</defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#og-bg)" />
	<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#og-glow-orange)" />
	<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#og-glow-blue)" />
	<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#og-left-scrim)" />
	<image x="667" y="50" width="486" height="486" href="${logoLargeDataUri}" opacity="1" clip-path="url(#og-logo-trim)" preserveAspectRatio="xMidYMid meet" />
	<rect x="${contentX}" y="74" width="${localeChipWidth}" height="56" rx="15" class="chip" />
<rect x="${contentX}" y="542" width="458" height="4" rx="2" fill="url(#og-accent)" />
<text x="${contentX + 24}" y="110" class="chip-label">${escapeXml(localeLabel)}</text>
${serviceText}
${headingText}
${descriptionText}
<rect x="${contentX - 2}" y="554" width="48" height="48" rx="10" fill="#ffffff1f" stroke="#ffffff33" stroke-width="1.5" />
<image x="${contentX}" y="556" width="44" height="44" href="${logoSmallDataUri}" preserveAspectRatio="xMidYMid meet" />
<text x="${contentX + 56}" y="588" class="brand">${escapeXml(BRAND_NAME)}</text>
<text x="1132" y="590" text-anchor="end" class="domain">craigs.autos</text>
</svg>`;
}

async function ensureRequiredFiles() {
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

async function collectEntries() {
  const localeDirs = await fs.readdir(CONTENT_ROOT, { withFileTypes: true });
  const entries = [];
  const dedupe = new Set();

  for (const dir of localeDirs) {
    if (!dir.isDirectory()) {
      continue;
    }

    const locale = dir.name;
    const files = await fs.readdir(path.join(CONTENT_ROOT, locale));
    for (const file of files) {
      if (!file.endsWith('.mdx') && !file.endsWith('.md')) {
        continue;
      }

      const fullPath = path.join(CONTENT_ROOT, locale, file);
      const raw = await fs.readFile(fullPath, 'utf8');
      const { title, description, pageKey } = parseFrontmatter(raw, fullPath);

      const dedupeKey = `${locale}/${pageKey}`;
      if (dedupe.has(dedupeKey)) {
        throw new Error(`Duplicate pageKey for locale found: ${dedupeKey}`);
      }
      dedupe.add(dedupeKey);

      entries.push({
        locale,
        pageKey,
        title: normalizeOgTitle(title),
        description: normalizeText(description),
        sourcePath: fullPath,
      });
    }
  }

  entries.sort((a, b) => `${a.locale}/${a.pageKey}`.localeCompare(`${b.locale}/${b.pageKey}`));
  return entries;
}

async function renderImage({ entry, logoDataUri }) {
  const localeMeta = LOCALES[entry.locale];
  const localeLabel = localeMeta?.nativeLabel ?? entry.locale;
  const { brandHeadline, serviceLabel, description } = buildCardCopy(entry);

  const svg = buildSvg({
    brandHeadline,
    serviceLabel,
    description,
    localeLabel,
    logoSmallDataUri: logoDataUri.small,
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

async function main() {
  await ensureRequiredFiles();

  const entries = await collectEntries();
  if (entries.length === 0) {
    throw new Error('No localized page entries were found for OG generation.');
  }

  await fs.rm(OUTPUT_ROOT, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });

  const logoSmallBuffer = await sharp(LOGO_PATH)
    .resize(72, 72, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const logoLargeBuffer = await sharp(LOGO_PATH)
    .resize(560, 560, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const logoDataUri = {
    small: `data:image/png;base64,${logoSmallBuffer.toString('base64')}`,
    large: `data:image/png;base64,${logoLargeBuffer.toString('base64')}`,
  };

  for (const entry of entries) {
    await renderImage({ entry, logoDataUri });
  }

  const locales = new Set(entries.map((entry) => entry.locale));
  console.log(
    `Generated ${entries.length} localized Open Graph images across ${locales.size} locales in ${path.relative(
      ROOT,
      OUTPUT_ROOT,
    )}.`,
  );
}

main().catch((error) => {
  console.error(`OG generation failed: ${error.message}`);
  process.exit(1);
});
