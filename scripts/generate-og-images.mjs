import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { LOCALES, BRAND_NAME } from '../src/lib/site-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CONTENT_ROOT = path.join(ROOT, 'src/content/pages');
const OUTPUT_ROOT = path.join(ROOT, 'public/og');
const LOGO_PATH = path.join(ROOT, 'public/brand/logo-512.png');
const FALLBACK_BG = path.join(ROOT, 'public/og-image.jpg');

const WIDTH = 1200;
const HEIGHT = 630;

const FONT_FILES = [
	path.join(ROOT, 'scripts/og-fonts/NotoSans-Regular.ttf'),
	path.join(ROOT, 'scripts/og-fonts/NotoSansArabic-Regular.ttf'),
	path.join(ROOT, 'scripts/og-fonts/NotoSansDevanagari-Regular.ttf'),
	path.join(ROOT, 'scripts/og-fonts/NotoSansTamil-Regular.ttf'),
	path.join(ROOT, 'scripts/og-fonts/NotoSansCJK-Regular.ttc'),
];

const BACKGROUND_BY_PAGE_KEY = {
	home: path.join(
		ROOT,
		'src/assets/images/services/car-seats/suv-diamond-stitched-seat-interior.jpg',
	),
	autoUpholstery: path.join(
		ROOT,
		'src/assets/images/services/car-seats/custom-seat-set-two-tone-upholstery.jpg',
	),
	upholsteryGuide: path.join(
		ROOT,
		'src/assets/images/services/car-seats/classic-red-bench-seat-detail.jpg',
	),
	carSeats: path.join(
		ROOT,
		'src/assets/images/services/car-seats/sedan-front-seats-reupholstery-installed.jpg',
	),
	motorcycleSeats: path.join(
		ROOT,
		'src/assets/images/services/motorcycle-seats/motorcycle-seat-upholstery-green-finish.jpg',
	),
	headliners: path.join(
		ROOT,
		'src/assets/images/projects/buick-eight/buick-eight-classic-car-upholstery-headliner.jpg',
	),
	convertibleTops: path.join(
		ROOT,
		'src/assets/images/projects/porsche-boxster-s-seat-project/porsche-boxster-s-seat-upholstery-cabin-overview.jpg',
	),
	classicCars: path.join(
		ROOT,
		'src/assets/images/projects/buick-eight/buick-eight-classic-car-upholstery-exterior-front-quarter.jpg',
	),
	gallery: path.join(
		ROOT,
		'src/assets/images/projects/porsche-boxster-s-seat-project/porsche-boxster-s-seat-upholstery-front-seats-close.jpg',
	),
	reviews: path.join(
		ROOT,
		'src/assets/images/projects/buick-eight/buick-eight-classic-car-upholstery-delivery-photo.jpg',
	),
	contact: path.join(
		ROOT,
		'src/assets/images/projects/buick-eight/buick-eight-classic-car-upholstery-cockpit.jpg',
	),
	buickEight: path.join(
		ROOT,
		'src/assets/images/projects/buick-eight/buick-eight-classic-car-upholstery-front-seats.jpg',
	),
	porscheBoxsterSSeatProject: path.join(
		ROOT,
		'src/assets/images/projects/porsche-boxster-s-seat-project/porsche-boxster-s-seat-upholstery-seat-detail.jpg',
	),
};

function escapeXml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function normalizeText(value) {
	return String(value ?? '').replace(/\s+/g, ' ').trim();
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

function wrapText(input, maxUnits, maxLines) {
	const text = normalizeText(input);
	if (!text) {
		return [];
	}

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
		lines[lastIndex] = `${trimToUnits(lines[lastIndex], maxUnits - 1)}...`;
	}

	return lines.slice(0, maxLines);
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

function buildSvg({ title, description, localeLabel, logoDataUri }) {
	const titleChars = Array.from(title).length;
	let titleSize = 70;
	let titleUnits = 22;
	if (titleChars > 45) {
		titleSize = 60;
		titleUnits = 24;
	}
	if (titleChars > 65) {
		titleSize = 50;
		titleUnits = 27;
	}

	const descriptionChars = Array.from(description).length;
	let descriptionSize = descriptionChars > 120 ? 31 : 34;
	let descriptionUnits = descriptionSize === 34 ? 45 : 50;
	if (descriptionChars > 180) {
		descriptionSize = 28;
		descriptionUnits = 56;
	}

	const titleLines = wrapText(title, titleUnits, 2);
	const descriptionLines = wrapText(description, descriptionUnits, 2);

	const titleLineHeight = Math.round(titleSize * 1.18);
	const descriptionLineHeight = Math.round(descriptionSize * 1.25);

	const titleStartY = 205;
	const descriptionStartY = titleStartY + titleLines.length * titleLineHeight + 36;
	const localeChipWidth = Math.min(540, Math.max(170, Array.from(localeLabel).length * 22));

	const titleText = titleLines
		.map(
			(line, index) =>
				`<text x="64" y="${titleStartY + index * titleLineHeight}" class="title">${escapeXml(line)}</text>`,
		)
		.join('');

	const descriptionText = descriptionLines
		.map(
			(line, index) =>
				`<text x="64" y="${descriptionStartY + index * descriptionLineHeight}" class="description">${escapeXml(line)}</text>`,
		)
		.join('');

	return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="og-overlay" x1="0" y1="0" x2="0" y2="${HEIGHT}" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="#050505" stop-opacity="0.35" />
    <stop offset="56%" stop-color="#050505" stop-opacity="0.76" />
    <stop offset="100%" stop-color="#050505" stop-opacity="0.88" />
  </linearGradient>
  <linearGradient id="og-accent" x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="#fef3c7" stop-opacity="0.95" />
    <stop offset="50%" stop-color="#fca5a5" stop-opacity="0.9" />
    <stop offset="100%" stop-color="#93c5fd" stop-opacity="0.95" />
  </linearGradient>
  <style>
    .title { fill: #fff; font: 700 ${titleSize}px 'Noto Sans', sans-serif; letter-spacing: -0.02em; }
    .description { fill: #e5e7eb; font: 500 ${descriptionSize}px 'Noto Sans', sans-serif; letter-spacing: -0.01em; }
    .brand { fill: #ffffff; font: 700 30px 'Noto Sans', sans-serif; letter-spacing: -0.01em; }
    .chip { fill: #111827cc; stroke: #ffffff55; stroke-width: 2; }
    .chip-label { fill: #f8fafc; font: 600 24px 'Noto Sans', sans-serif; letter-spacing: 0.01em; }
    .domain { fill: #cbd5e1; font: 600 24px 'Noto Sans', sans-serif; letter-spacing: 0.04em; }
  </style>
</defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#og-overlay)" />
<rect x="64" y="74" width="${localeChipWidth}" height="56" rx="15" class="chip" />
<rect x="64" y="536" width="420" height="4" rx="2" fill="url(#og-accent)" />
<text x="89" y="110" class="chip-label">${escapeXml(localeLabel)}</text>
${titleText}
${descriptionText}
<image x="64" y="556" width="46" height="46" href="${logoDataUri}" preserveAspectRatio="xMidYMid meet" />
<text x="124" y="590" class="brand">${escapeXml(BRAND_NAME)}</text>
<text x="1134" y="592" text-anchor="end" class="domain">craigs.autos</text>
</svg>`;
}

async function ensureRequiredFiles() {
	const checks = [
		{ label: 'logo', path: LOGO_PATH },
		{ label: 'fallback og image', path: FALLBACK_BG },
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
				title: normalizeText(title),
				description: normalizeText(description),
				sourcePath: fullPath,
			});
		}
	}

	entries.sort((a, b) => `${a.locale}/${a.pageKey}`.localeCompare(`${b.locale}/${b.pageKey}`));
	return entries;
}

async function renderImage({ entry, logoDataUri }) {
	const backgroundPath = BACKGROUND_BY_PAGE_KEY[entry.pageKey];
	if (!backgroundPath) {
		throw new Error(
			`Missing background mapping for pageKey "${entry.pageKey}" from ${entry.sourcePath}`,
		);
	}

	const localeMeta = LOCALES[entry.locale];
	const localeLabel = localeMeta?.nativeLabel ?? entry.locale;

	const background = await sharp(backgroundPath)
		.resize(WIDTH, HEIGHT, { fit: 'cover', position: 'attention' })
		.modulate({ saturation: 1.08, brightness: 0.96 })
		.jpeg({ quality: 92 })
		.toBuffer();

	const svg = buildSvg({
		title: entry.title,
		description: entry.description,
		localeLabel,
		logoDataUri,
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

	await sharp(background)
		.composite([{ input: overlay.asPng(), blend: 'over' }])
		.jpeg({ quality: 86, mozjpeg: true, chromaSubsampling: '4:4:4' })
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

	const logoBuffer = await sharp(LOGO_PATH)
		.resize(72, 72, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toBuffer();
	const logoDataUri = `data:image/png;base64,${logoBuffer.toString('base64')}`;

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
