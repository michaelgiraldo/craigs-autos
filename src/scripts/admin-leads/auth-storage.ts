import { AUTH_STORAGE_KEY } from './config';

export function readAdminAuth(): string {
  try {
    return sessionStorage.getItem(AUTH_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function writeAdminAuth(auth: string): void {
  try {
    sessionStorage.setItem(AUTH_STORAGE_KEY, auth);
  } catch {
    // If session storage is unavailable, keep auth in memory for this page load.
  }
}

export function clearAdminAuth(): void {
  try {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
