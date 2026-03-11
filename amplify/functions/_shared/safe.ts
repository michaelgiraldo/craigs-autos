export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

export function getErrorDetails(error: unknown): {
  name: string | null;
  message: string | null;
  status: number | null;
} {
  const record = asObject(error);
  return {
    name:
      typeof record?.name === 'string' ? record.name : error instanceof Error ? error.name : null,
    message:
      typeof record?.message === 'string'
        ? record.message
        : error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : null,
    status: typeof record?.status === 'number' ? record.status : null,
  };
}
