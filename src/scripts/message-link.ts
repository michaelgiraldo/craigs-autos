import { PUBLIC_API_ROUTES } from '../../shared/public-api-contract.js';
import { resolvePublicApiUrl, withFetchTimeout } from '../lib/backend/public-api-client';

type MessageLinkResponse = {
  body?: string;
  ok?: boolean;
  to_phone?: string;
};

function getRequiredElement<T extends HTMLElement>(id: string, elementType: { new (): T }): T {
  const element = document.getElementById(id);
  if (element instanceof elementType) return element;
  throw new Error(`Missing message-link element: ${id}`);
}

function getToken() {
  const url = new URL(window.location.href);
  const qsToken = url.searchParams.get('token');
  const token = qsToken?.trim();
  if (token) return token;

  // Best-effort support for /message/<token>/ if a rewrite rule is added later.
  const parts = url.pathname.split('/').filter(Boolean);
  const messageIndex = parts.indexOf('message');
  if (messageIndex !== -1 && parts[messageIndex + 1]) return parts[messageIndex + 1];

  return '';
}

function normalizeE164Digits(phone: unknown) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  if (digits.length >= 7 && digits.length <= 15) return digits;
  return '';
}

function buildTelHref(phone: unknown) {
  const e164Digits = normalizeE164Digits(phone);
  if (!e164Digits) return '#';
  return `tel:+${e164Digits}`;
}

function buildSmsHref(phone: unknown, body: unknown) {
  const e164Digits = normalizeE164Digits(phone);
  if (!e164Digits) return '#';
  const to = `+${e164Digits}`;
  const text = typeof body === 'string' ? body : '';
  if (!text.trim()) return `sms:${to}`;
  // Works on iOS/macOS; some clients accept `?body=` as well, but `?&body=` is broadly compatible.
  return `sms:${to}?&body=${encodeURIComponent(text)}`;
}

function showError(statusEl: HTMLElement, message: string) {
  statusEl.textContent = message;
  statusEl.classList.add('error');
}

export async function initMessageLinkPage() {
  const statusEl = getRequiredElement('status', HTMLParagraphElement);
  const toEl = getRequiredElement('to', HTMLDivElement);
  const bodyEl = getRequiredElement('body', HTMLPreElement);
  const openSmsEl = getRequiredElement('open-sms', HTMLAnchorElement);
  const callEl = getRequiredElement('call', HTMLAnchorElement);
  const copyPhoneBtn = getRequiredElement('copy-phone', HTMLButtonElement);
  const copyBodyBtn = getRequiredElement('copy-body', HTMLButtonElement);

  const token = getToken();
  if (!token) {
    showError(statusEl, 'Missing token.');
    return;
  }

  const apiUrl = await resolvePublicApiUrl(PUBLIC_API_ROUTES.chatMessageLink);
  if (!apiUrl) {
    showError(statusEl, 'Message link service is not configured.');
    return;
  }

  let data: MessageLinkResponse;
  try {
    const res = await fetch(
      `${apiUrl}?token=${encodeURIComponent(token)}`,
      withFetchTimeout({ cache: 'no-store' }),
    );
    data = (await res.json()) as MessageLinkResponse;
    if (!res.ok || !data?.ok) {
      throw new Error(`Message link lookup failed (${res.status})`);
    }
  } catch {
    showError(statusEl, 'This link is invalid or expired.');
    return;
  }

  const to = data.to_phone;
  const body = data.body || '';
  const smsHref = buildSmsHref(to, body);
  const telHref = buildTelHref(to);

  toEl.textContent = to || '-';
  bodyEl.textContent = body || '-';
  openSmsEl.href = smsHref;
  callEl.href = telHref;

  copyPhoneBtn.addEventListener('click', async () => {
    if (!to) return;
    try {
      await navigator.clipboard.writeText(String(to));
      copyPhoneBtn.textContent = 'Copied';
      setTimeout(() => {
        copyPhoneBtn.textContent = 'Copy phone';
      }, 1200);
    } catch {}
  });

  copyBodyBtn.addEventListener('click', async () => {
    if (!body) return;
    try {
      await navigator.clipboard.writeText(body);
      copyBodyBtn.textContent = 'Copied';
      setTimeout(() => {
        copyBodyBtn.textContent = 'Copy message';
      }, 1200);
    } catch {}
  });

  statusEl.textContent = 'Draft ready. Send via SMS or copy the message.';

  // Best-effort auto-open. If the browser blocks it, the primary button remains.
  setTimeout(() => {
    try {
      window.location.href = smsHref;
    } catch {}
  }, 50);
}
