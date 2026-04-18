export type TranscriptLineLike = {
  speaker: string;
  text: string;
};

export {
  emailToMailto,
  escapeHtml,
  formatListHtml,
  formatListText,
  isPlausibleEmail,
  isPlausiblePhone,
  mailtoWithDraft,
  normalizeWhitespace,
  phoneToE164,
  phoneToTelHref,
  safeHttpUrl,
} from '../_shared/text-utils.ts';

import { isPlausibleEmail, isPlausiblePhone } from '../_shared/text-utils.ts';

export function trimTranscriptForModel(value: string, maxChars = 16_000): string {
  if (value.length <= maxChars) return value;
  const headChars = Math.min(4_000, Math.floor(maxChars * 0.25));
  const separator = '\n\n... (earlier messages omitted) ...\n\n';
  const tailChars = Math.max(0, maxChars - headChars - separator.length);
  const head = value.slice(0, headChars);
  const tail = value.slice(-tailChars);
  return `${head}${separator}${tail}`.trim();
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
    case 'id':
      return 'Indonesian';
    case 'fa':
      return 'Persian';
    case 'te':
      return 'Telugu';
    case 'fr':
      return 'French';
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
  for (let match = phoneRegex.exec(customerText); match; match = phoneRegex.exec(customerText)) {
    const raw = (match[1] ?? '').trim();
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
