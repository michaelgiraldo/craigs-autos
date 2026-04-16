import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { BRAND_NAME } from '../src/lib/site-data.js';
import { getPageSocialCard } from '../src/lib/social-cards/getPageSocialCard.js';
import { charUnits, normalizeSocialText } from '../src/lib/social-cards/text.js';
import { getManifestPageEntries } from '../src/lib/site-data/page-manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

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
  const text = normalizeSocialText(input);
  if (!text) {
    return [];
  }

  const hasSpaces = /\s/u.test(text);
  if (!hasSpaces) {
    return wrapByCharacters(text, maxUnits, maxLines);
  }

  return wrapByWords(text, maxUnits, maxLines);
}

function getHeadlineSizing(headline, template) {
  const headlineChars = Array.from(headline).length;
  let fontSize = 78;
  let maxUnits = 14;

  if (template === 'project' && headlineChars <= 28) {
    return { fontSize: 68, maxUnits: 17 };
  }

  if (headlineChars > 24) {
    fontSize = 60;
    maxUnits = 18;
  }
  if (headlineChars > 34) {
    fontSize = 54;
    maxUnits = 20;
  }
  if (headlineChars > 46) {
    fontSize = 48;
    maxUnits = 22;
  }

  return { fontSize, maxUnits };
}

function getEyebrowSizing(eyebrow) {
  const eyebrowChars = Array.from(eyebrow).length;
  let fontSize = 42;
  let maxUnits = 28;

  if (eyebrowChars > 26) {
    fontSize = 36;
    maxUnits = 32;
  }
  if (eyebrowChars > 38) {
    fontSize = 32;
    maxUnits = 36;
  }

  return { fontSize, maxUnits };
}

function getSummarySizing(summary) {
  const summaryChars = Array.from(summary).length;
  let fontSize = 30;
  let maxUnits = 38;

  if (summaryChars > 160) {
    fontSize = 27;
    maxUnits = 44;
  }

  return { fontSize, maxUnits };
}

function buildSvg({ card, logoLargeDataUri }) {
  const { eyebrow, headline, summary } = card.render;
  const heading = getHeadlineSizing(headline, card.template);
  const eyebrowStyle = getEyebrowSizing(eyebrow);
  const summaryStyle = getSummarySizing(summary);

  const eyebrowLines = wrapText(eyebrow, eyebrowStyle.maxUnits, 2);
  const headlineLines = wrapText(headline, heading.maxUnits, 2);
  const summaryLines = wrapText(
    summary,
    summaryStyle.maxUnits,
    card.template === 'project' ? 3 : 2,
  );

  const eyebrowLineHeight = Math.round(eyebrowStyle.fontSize * 1.2);
  const headlineLineHeight = Math.round(heading.fontSize * 1.08);
  const summaryLineHeight = Math.round(summaryStyle.fontSize * 1.27);

  const contentX = 84;
  const eyebrowStartY = 142;
  const headlineStartY = eyebrowStartY + eyebrowLines.length * eyebrowLineHeight + 42;
  const summaryStartY = headlineStartY + headlineLines.length * headlineLineHeight + 36;

  const eyebrowText = eyebrowLines
    .map(
      (line, index) =>
        `<text x="${contentX}" y="${eyebrowStartY + index * eyebrowLineHeight}" class="eyebrow">${escapeXml(line)}</text>`,
    )
    .join('');

  const headlineText = headlineLines
    .map(
      (line, index) =>
        `<text x="${contentX}" y="${headlineStartY + index * headlineLineHeight}" class="headline">${escapeXml(line)}</text>`,
    )
    .join('');

  const summaryText = summaryLines
    .map(
      (line, index) =>
        `<text x="${contentX}" y="${summaryStartY + index * summaryLineHeight}" class="summary">${escapeXml(line)}</text>`,
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
    .eyebrow {
      fill: #fb923c;
      font-family: 'Noto Sans', sans-serif;
      font-size: ${eyebrowStyle.fontSize}px;
      font-weight: 700;
      letter-spacing: -0.005em;
    }
    .headline {
      fill: #ffffff;
      font-family: 'Noto Sans', sans-serif;
      font-size: ${heading.fontSize}px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .summary {
      fill: #e2e8f0;
      font-family: 'Noto Sans', sans-serif;
      font-size: ${summaryStyle.fontSize}px;
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
	<rect x="${contentX}" y="542" width="458" height="4" rx="2" fill="url(#og-accent)" />
	${eyebrowText}
${headlineText}
${summaryText}
	<text x="${contentX}" y="588" class="brand">${escapeXml(BRAND_NAME)}</text>
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

function collectEntries() {
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

async function renderImage({ entry, logoDataUri }) {
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

async function main() {
  await ensureRequiredFiles();

  const entries = collectEntries();
  if (entries.length === 0) {
    throw new Error('No localized page entries were found for social image generation.');
  }

  await fs.rm(OUTPUT_ROOT, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });

  const logoLargeBuffer = await sharp(LOGO_PATH)
    .resize(560, 560, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const logoDataUri = {
    large: `data:image/png;base64,${logoLargeBuffer.toString('base64')}`,
  };

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

main().catch((error) => {
  console.error(`Social image generation failed: ${error.message}`);
  process.exit(1);
});
