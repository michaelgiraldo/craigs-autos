import { jsonResponse } from '../_shared/http.ts';
import type { LambdaEvent, LambdaResult } from './types.ts';

export function unauthorizedResponse(): LambdaResult {
  return jsonResponse(
    401,
    { error: 'Unauthorized' },
    { 'WWW-Authenticate': 'Basic realm="Admin"' },
  );
}

export function isAuthorized(event: LambdaEvent, adminPassword: string): boolean {
  const header = event?.headers?.authorization ?? event?.headers?.Authorization ?? '';
  if (!header.startsWith('Basic ')) return false;

  const encoded = header.slice('Basic '.length).trim();
  if (!encoded) return false;

  let decoded = '';
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return false;
  }

  const [user, pass] = decoded.split(':');
  if (!user) return false;
  return pass === adminPassword;
}
