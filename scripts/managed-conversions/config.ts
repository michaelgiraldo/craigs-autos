import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  parseManagedConversionDestinationConfig,
  type DestinationReadiness,
  type ManagedConversionDestinationConfig,
} from '../../amplify/functions/_lead-platform/services/provider-conversion-destination-config.ts';
import { repoRoot } from './constants.ts';
import type { CliOptions } from './types.ts';

export function resolvePath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.join(repoRoot, inputPath);
}

export async function loadJsonFile(filePath: string): Promise<unknown> {
  const raw = await readFile(resolvePath(filePath), 'utf8');
  return JSON.parse(raw) as unknown;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export async function loadEnv(options: CliOptions): Promise<Record<string, string | undefined>> {
  const env: Record<string, string | undefined> = { ...process.env };
  if (!options.envFile) return env;

  const raw = await readFile(resolvePath(options.envFile), 'utf8');
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const normalized = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trim()
      : trimmed;
    const separator = normalized.indexOf('=');
    if (separator <= 0) continue;
    const key = normalized.slice(0, separator).trim();
    const value = unquote(normalized.slice(separator + 1));
    env[key] = value;
  }

  return env;
}

export async function loadConfig(options: CliOptions): Promise<{
  config: ManagedConversionDestinationConfig;
  warnings: string[];
}> {
  const parsed = parseManagedConversionDestinationConfig(await loadJsonFile(options.configPath));
  if (!parsed.ok) {
    throw new Error(`Invalid managed conversion config:\n- ${parsed.errors.join('\n- ')}`);
  }
  return {
    config: parsed.config,
    warnings: parsed.warnings,
  };
}

export function readinessFailures(readiness: DestinationReadiness[]): DestinationReadiness[] {
  return readiness.filter(
    (item) => item.enabled && item.status !== 'ready' && item.status !== 'disabled',
  );
}

export function printReadiness(readiness: DestinationReadiness[]): void {
  console.log('Managed conversion destination readiness');
  console.log('destination         enabled  mode     status                    missing');
  for (const item of readiness) {
    console.log(
      [
        item.destination_key.padEnd(19),
        String(item.enabled ? 'yes' : 'no').padEnd(8),
        String(item.mode ?? '-').padEnd(8),
        item.status.padEnd(25),
        item.missing_config_keys.join(', ') || '-',
      ].join(''),
    );
  }
}

export function printWarnings(warnings: string[], json: boolean): void {
  if (json || !warnings.length) return;
  for (const warning of warnings) {
    console.warn(`warning: ${warning}`);
  }
}
