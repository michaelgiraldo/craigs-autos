import type { CaptureChannel } from './types.ts';

export function trimToNull(value: unknown, maxLength = 512): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength);
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeLocale(value: unknown): string | null {
  const trimmed = trimToNull(value, 32);
  return trimmed ? trimmed.toLowerCase() : null;
}

export function normalizeEmail(value: unknown): string | null {
  const trimmed = trimToNull(value, 320);
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

export function normalizePhoneDigits(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

export function normalizePhoneE164(value: unknown): string | null {
  const digits = normalizePhoneDigits(value);
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

export function dedupeStrings(values: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of Array.from(values)) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

export function normalizeStringList(value: unknown, maxItemLength = 256): string[] {
  if (!Array.isArray(value)) return [];
  return dedupeStrings(
    value.map((item) =>
      typeof item === 'string'
        ? item.length <= maxItemLength
          ? item
          : item.slice(0, maxItemLength)
        : null,
    ),
  );
}

export type SplitName = {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
};

export function splitDisplayName(value: unknown): SplitName {
  const normalized = trimToNull(value, 200);
  if (!normalized) {
    return { displayName: null, firstName: null, lastName: null };
  }

  const displayName = normalizeWhitespace(normalized);
  if (!displayName) {
    return { displayName: null, firstName: null, lastName: null };
  }

  const [firstName, ...rest] = displayName.split(' ');
  const lastName = rest.length ? rest.join(' ') : null;

  return {
    displayName,
    firstName: firstName ?? null,
    lastName,
  };
}

export function buildLeadTitle(args: {
  channel: CaptureChannel;
  vehicle?: string | null;
  service?: string | null;
  project?: string | null;
  message?: string | null;
  displayName?: string | null;
}): string {
  const vehicle = trimToNull(args.vehicle, 160);
  const service = trimToNull(args.service, 120);
  const project = trimToNull(args.project, 160);
  const message = trimToNull(args.message, 160);
  const displayName = trimToNull(args.displayName, 120);

  const parts = dedupeStrings([service, vehicle, project]);
  if (parts.length) return parts.join(' · ');
  if (message) return message;
  if (displayName) return `${args.channel} lead · ${displayName}`;
  return `${args.channel} lead`;
}

export function choosePreferredName(
  current: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const currentValue = trimToNull(current, 200);
  const incomingValue = trimToNull(incoming, 200);
  if (!currentValue) return incomingValue;
  if (!incomingValue) return currentValue;
  return incomingValue.length > currentValue.length ? incomingValue : currentValue;
}

export function toRecordEntries<T extends string>(
  keys: readonly T[],
  valueFactory: (key: T) => string | null,
): Record<T, string | null> {
  return keys.reduce(
    (acc, key) => {
      acc[key] = valueFactory(key);
      return acc;
    },
    {} as Record<T, string | null>,
  );
}
