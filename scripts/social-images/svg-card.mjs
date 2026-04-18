import { BRAND_NAME } from '../../src/lib/site-data.js';
import { HEIGHT, WIDTH } from './config.mjs';
import { getEyebrowSizing, getHeadlineSizing, getSummarySizing, wrapText } from './text-layout.mjs';

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildSvg({ card, logoLargeDataUri }) {
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
