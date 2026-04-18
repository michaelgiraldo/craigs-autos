export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

export function phoneToE164(value: string): string | null {
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

export function phoneToTelHref(value: string): string | null {
  const e164 = phoneToE164(value);
  return e164 ? `tel:${e164}` : null;
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
