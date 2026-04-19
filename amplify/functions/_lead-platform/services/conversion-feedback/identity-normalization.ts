import { createHash } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeBasicText(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized ? normalized : null;
}

export function normalizeGoogleEnhancedEmail(value: string | null | undefined): string | null {
  const normalized = normalizeBasicText(value);
  if (!normalized) return null;

  const [localPart, domain, ...rest] = normalized.split('@');
  if (!localPart || !domain || rest.length) return normalized;
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return normalized;

  const withoutPlus = localPart.split('+')[0];
  return `${withoutPlus.split('.').join('')}@${domain}`;
}

export function hashGoogleEnhancedEmail(value: string | null | undefined): string | null {
  const normalized = normalizeGoogleEnhancedEmail(value);
  return normalized ? sha256Hex(normalized) : null;
}

export function normalizeE164Phone(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? '';
  if (!raw) return null;
  if (/^\+\d{8,15}$/.test(raw)) return raw;

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function hashGooglePhone(value: string | null | undefined): string | null {
  const normalized = normalizeE164Phone(value);
  return normalized ? sha256Hex(normalized) : null;
}

export function normalizeYelpPhone(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? '';
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  return null;
}

export function normalizeYelpName(value: string | null | undefined): string | null {
  const normalized = normalizeBasicText(value);
  return normalized ? normalized.replace(/[^a-z0-9]/g, '') : null;
}

export function hashNormalizedValue(value: string | null | undefined): string | null {
  return value ? sha256Hex(value) : null;
}
