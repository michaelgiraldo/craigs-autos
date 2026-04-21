export function firstItem<T>(items: T[] | undefined): T | null {
  return items?.[0] ?? null;
}

export function removeNullKeys<T extends Record<string, unknown>>(
  item: T,
  keys: Array<keyof T>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...item };
  for (const key of keys) {
    if (next[key as string] === null) {
      delete next[key as string];
    }
  }
  return next;
}

export function stripUndefinedValues<T extends Record<string, unknown>>(
  item: T,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }
  return next;
}
