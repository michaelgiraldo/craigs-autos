import { JOURNEY_STORAGE_KEY, STORAGE_KEY, USER_STORAGE_KEY } from './constants';
import type { StoredAttributionState, StoredJourneyState } from './types';

export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function readAttributionStorage(): StoredAttributionState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as StoredAttributionState;
  } catch {
    return null;
  }
}

export function readJourneyStorage(): StoredJourneyState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(JOURNEY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as StoredJourneyState;
  } catch {
    return null;
  }
}

export function writeJourneyStorage(value: StoredJourneyState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage failures.
  }
}

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie ? document.cookie.split(';') : [];
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split('=');
    if (key && key.trim() === name) {
      return decodeURIComponent(rest.join('=') || '').trim() || null;
    }
  }
  return null;
}

export function getStoredLeadUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage?.getItem(USER_STORAGE_KEY);
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}
