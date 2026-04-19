import type { ProviderExecutionMode } from './adapter-types.ts';

export type ProviderRawConfig = Record<string, string | number | boolean | null | undefined>;

export function trimToNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseBoolean(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function normalizeCurrencyCode(value: unknown): string | null {
  const normalized = trimToNull(value)?.toUpperCase() ?? null;
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

export function parseProviderExecutionMode(value: unknown): ProviderExecutionMode {
  const normalized = trimToNull(value)?.toLowerCase();
  if (normalized === 'disabled') return 'disabled';
  if (normalized === 'test' || normalized === 'validate_only' || normalized === 'test_event') {
    return 'test';
  }
  if (normalized === 'live') return 'live';
  return 'dry_run';
}

export function readConfigValue(
  env: Record<string, string | undefined>,
  providerConfig: ProviderRawConfig,
  envKey: string,
  providerKey: string,
): string | number | boolean | null | undefined {
  return providerConfig[providerKey] ?? env[envKey];
}

export function readStringConfigValue(
  env: Record<string, string | undefined>,
  providerConfig: ProviderRawConfig,
  envKey: string,
  providerKey: string,
): string | null {
  const value = readConfigValue(env, providerConfig, envKey, providerKey);
  return typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : trimToNull(value);
}

export function isRetryableStatus(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

export function isAuthOrConfigStatus(statusCode: number): boolean {
  return statusCode === 400 || statusCode === 401 || statusCode === 403 || statusCode === 404;
}
