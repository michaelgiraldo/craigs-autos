import { isPlausiblePhone } from '../_shared/text-utils.ts';
import type { QuoteRequestSubmitRequest } from './request.ts';

export type QuoteRequestSubmitValidationResult =
  | { ok: true }
  | { ok: false; kind: 'honeypot'; statusCode: 202; body: { ok: true } }
  | { ok: false; kind: 'invalid'; statusCode: 400; body: { error: string } };

function isValidEmail(value: string) {
  return value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUsablePhone(value: string) {
  return value === '' || isPlausiblePhone(value);
}

export function validateQuoteRequestSubmitRequest(
  request: QuoteRequestSubmitRequest,
): QuoteRequestSubmitValidationResult {
  if (request.company) {
    return { ok: false, kind: 'honeypot', statusCode: 202, body: { ok: true } };
  }

  if (!request.name || (!request.phone && !request.email)) {
    return {
      ok: false,
      kind: 'invalid',
      statusCode: 400,
      body: { error: 'Name and either a phone number or email are required.' },
    };
  }

  if (!isValidEmail(request.email)) {
    return {
      ok: false,
      kind: 'invalid',
      statusCode: 400,
      body: { error: 'Email is invalid.' },
    };
  }

  if (!isUsablePhone(request.phone)) {
    return {
      ok: false,
      kind: 'invalid',
      statusCode: 400,
      body: { error: 'Phone number is invalid.' },
    };
  }

  return { ok: true };
}
