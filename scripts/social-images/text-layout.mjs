import { charUnits, normalizeSocialText } from '../../src/lib/social-cards/text.js';

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

export function wrapText(input, maxUnits, maxLines) {
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

export function getHeadlineSizing(headline, template) {
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

export function getEyebrowSizing(eyebrow) {
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

export function getSummarySizing(summary) {
  const summaryChars = Array.from(summary).length;
  let fontSize = 30;
  let maxUnits = 38;

  if (summaryChars > 160) {
    fontSize = 27;
    maxUnits = 44;
  }

  return { fontSize, maxUnits };
}
