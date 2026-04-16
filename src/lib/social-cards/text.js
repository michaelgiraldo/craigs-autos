const TRAILING_PUNCTUATION = /[ ,.;:!?，。！？、：；-]+$/u;

export function normalizeSocialText(value) {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function stripSeoTitleSuffix(value) {
	let output = normalizeSocialText(value);
	output = output.replace(/\s*[|·•-]\s*Craig['’]s(?:\s+Auto\s+Upholstery)?$/iu, '');
	output = output.replace(/\s*\|\s*/g, ' · ');
	return output.trim();
}

export function truncateSocialText(value, maxChars) {
	const text = normalizeSocialText(value);
	if (!text || text.length <= maxChars) {
		return text;
	}

	return `${text.slice(0, Math.max(0, maxChars - 3)).replace(TRAILING_PUNCTUATION, '')}...`;
}

export function charUnits(char) {
	if (/\s/u.test(char)) {
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

export function visualUnits(value) {
	return Array.from(normalizeSocialText(value)).reduce((total, char) => total + charUnits(char), 0);
}
