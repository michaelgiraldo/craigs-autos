export function pickValue(obj: unknown, key: string): string | null {
  const value = obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getDeviceType(): 'mobile' | 'desktop' | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.matchMedia('(max-width: 900px)').matches ? 'mobile' : 'desktop';
  } catch {
    return null;
  }
}

export function getReferrerHost(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

export function normalizeToken(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function createJourneyId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `journey_${crypto.randomUUID()}`;
  }
  return `journey_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
