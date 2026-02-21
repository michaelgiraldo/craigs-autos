export type TranscriptLineLike = {
  speaker: string;
  text: string;
};

export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function trimTranscriptForModel(value: string, maxChars = 16_000): string {
  if (value.length <= maxChars) return value;
  const headChars = Math.min(4_000, Math.floor(maxChars * 0.25));
  const separator = '\n\n... (earlier messages omitted) ...\n\n';
  const tailChars = Math.max(0, maxChars - headChars - separator.length);
  const head = value.slice(0, headChars);
  const tail = value.slice(-tailChars);
  return `${head}${separator}${tail}`.trim();
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isPlausiblePhone(value: string): boolean {
  const digits = value.replace(/[^\d]/g, '');
  return digits.length >= 7;
}

export function phoneToTelHref(value: string): string | null {
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`;
  return `tel:+${digits}`;
}

export function emailToMailto(value: string): string | null {
  const email = value.trim();
  if (!isPlausibleEmail(email)) return null;
  // Keep addr-spec literal in the `mailto:` path so clients reliably populate the "To" field.
  return `mailto:${email}`;
}

export function mailtoWithDraft(email: string, subject: string, body: string): string | null {
  const base = emailToMailto(email);
  if (!base) return null;
  return `${base}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function formatListText(items: string[], prefix = '- '): string {
  return items.map((item) => `${prefix}${item}`).join('\n');
}

export function formatListHtml(items: string[]): string {
  if (!items.length) return '<p style="margin:0;color:#6b7280">None.</p>';
  const li = items.map((item) => `<li style="margin:0 0 8px">${escapeHtml(item)}</li>`).join('');
  return `<ol style="margin:0;padding-left:20px">${li}</ol>`;
}

export function localeToLanguageLabel(locale: string): string | null {
  const normalized = locale.trim().toLowerCase();
  switch (normalized) {
    case 'en':
      return 'English';
    case 'es':
      return 'Spanish';
    case 'pt-br':
      return 'Portuguese (Brazil)';
    case 'vi':
      return 'Vietnamese';
    case 'tl':
      return 'Tagalog';
    case 'ko':
      return 'Korean';
    case 'hi':
      return 'Hindi';
    case 'pa':
      return 'Punjabi';
    case 'ta':
      return 'Tamil';
    case 'ar':
      return 'Arabic';
    case 'ru':
      return 'Russian';
    case 'ja':
      return 'Japanese';
    case 'zh-hans':
      return 'Chinese (Simplified)';
    case 'zh-hant':
      return 'Chinese (Traditional)';
    default:
      return null;
  }
}

export function extractCustomerContact(
  transcript: TranscriptLineLike[],
  shopPhoneDigits: string,
): { email: string | null; phone: string | null } {
  const customerText = transcript
    .filter((line) => line.speaker === 'Customer')
    .map((line) => line.text)
    .join('\n');

  const emailMatch = customerText.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  const email = emailMatch ? emailMatch[0].trim() : null;

  const phoneCandidates: string[] = [];
  const phoneRegex = /(\+?\d[\d().\-\s]{7,}\d)/g;
  for (const match of customerText.matchAll(phoneRegex)) {
    const raw = (match?.[1] ?? '').trim();
    if (!raw) continue;
    const digits = raw.replace(/[^\d]/g, '');
    if (digits === shopPhoneDigits) continue;
    if (digits.length < 10 || digits.length > 15) continue;
    phoneCandidates.push(raw);
  }
  const phone = phoneCandidates.length ? phoneCandidates[0] : null;

  return {
    email: email && isPlausibleEmail(email) ? email : null,
    phone: phone && isPlausiblePhone(phone) ? phone : null,
  };
}
