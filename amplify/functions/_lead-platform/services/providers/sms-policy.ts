export const SMS_CONTENT_MAX_LENGTH = 1_600;

export type SmsContentValidation =
  | { ok: true; content: string }
  | { ok: false; reason: 'empty' | 'too_long'; message: string };

export function normalizeSmsRecipientE164(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('+')) {
    return /^\+[1-9]\d{7,14}$/.test(trimmed) ? trimmed : null;
  }

  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export function validateSmsContent(value: string): SmsContentValidation {
  const content = value.trim();
  if (!content) {
    return {
      ok: false,
      reason: 'empty',
      message: 'SMS content is empty',
    };
  }

  if (content.length > SMS_CONTENT_MAX_LENGTH) {
    return {
      ok: false,
      reason: 'too_long',
      message: `SMS content exceeds ${SMS_CONTENT_MAX_LENGTH} characters`,
    };
  }

  return { ok: true, content };
}
