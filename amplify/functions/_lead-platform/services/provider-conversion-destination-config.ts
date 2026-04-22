import {
  MANAGED_CONVERSION_DESTINATIONS,
  type ManagedConversionDestinationKey,
} from '@craigs/contracts/managed-conversion-contract';
import type {
  ProviderConversionDestination,
  ProviderConversionDestinationMode,
  ProviderConversionDestinationSource,
} from '../domain/conversion-feedback.ts';
import { MANAGED_CONVERSION_PROVIDER_DEFINITIONS } from './conversion-feedback/provider-catalog.ts';
import type { ProviderConfigField } from './conversion-feedback/provider-definition.ts';
import type { ProviderExecutionMode } from './conversion-feedback/adapter-types.ts';

export const MANAGED_CONVERSION_DESTINATION_CONFIG_VERSION =
  'craigs-managed-conversion-destinations-v1';

type PrimitiveConfigValue = string | number | boolean | null;
type ReadinessProviderDefinition = {
  key: ManagedConversionDestinationKey;
  label: string;
  configFields: readonly ProviderConfigField[];
  parseConfig(
    env: Record<string, string | undefined>,
    providerConfig: Record<string, PrimitiveConfigValue>,
  ): unknown;
  getMode(config: unknown): ProviderExecutionMode;
  getMissingValidationConfigKeys?(config: unknown): string[];
  getMissingDeliveryConfigKeys?(config: unknown): string[];
};

export type ManagedConversionDestinationConfigEntry = {
  destination_key: ManagedConversionDestinationKey;
  enabled: boolean;
  delivery_mode: ProviderConversionDestinationMode;
  config_source: ProviderConversionDestinationSource;
  provider_config: Record<string, PrimitiveConfigValue>;
};

export type ManagedConversionDestinationConfig = {
  version: typeof MANAGED_CONVERSION_DESTINATION_CONFIG_VERSION;
  destinations: ManagedConversionDestinationConfigEntry[];
};

export type DestinationConfigParseResult =
  | {
      ok: true;
      config: ManagedConversionDestinationConfig;
      warnings: string[];
    }
  | {
      ok: false;
      errors: string[];
      warnings: string[];
    };

export type DestinationReadinessStatus =
  | 'ready'
  | 'disabled'
  | 'needs_destination_config'
  | 'adapter_missing';

export type DestinationReadiness = {
  destination_key: ManagedConversionDestinationKey;
  destination_label: string;
  enabled: boolean;
  delivery_mode: ProviderConversionDestinationMode;
  mode: string | null;
  status: DestinationReadinessStatus;
  missing_config_keys: string[];
  messages: string[];
};

const providerDefinitionsByKey = new Map(
  MANAGED_CONVERSION_PROVIDER_DEFINITIONS.map((definition) => [
    definition.key,
    definition as unknown as ReadinessProviderDefinition,
  ]),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPrimitiveConfigValue(value: unknown): value is PrimitiveConfigValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function normalizeDestinationKey(value: unknown): ManagedConversionDestinationKey | null {
  if (typeof value !== 'string') return null;
  const key = value.trim();
  return Object.keys(MANAGED_CONVERSION_DESTINATIONS).includes(key)
    ? (key as ManagedConversionDestinationKey)
    : null;
}

function defaultDeliveryMode(
  destinationKey: ManagedConversionDestinationKey,
): ProviderConversionDestinationMode {
  return destinationKey === 'manual_export' ? 'manual' : 'provider_api';
}

function parseDeliveryMode(
  value: unknown,
  destinationKey: ManagedConversionDestinationKey,
): ProviderConversionDestinationMode | null {
  if (value === undefined) return defaultDeliveryMode(destinationKey);
  return value === 'manual' || value === 'provider_api' ? value : null;
}

function parseConfigSource(value: unknown): ProviderConversionDestinationSource | null {
  if (value === undefined) return 'config_file';
  return value === 'environment' || value === 'config_file' || value === 'system' ? value : null;
}

function configFieldsByProviderConfigKey(
  definition: { configFields: readonly ProviderConfigField[] } | undefined,
): Map<string, ProviderConfigField> {
  return new Map((definition?.configFields ?? []).map((field) => [field.providerConfigKey, field]));
}

function parseProviderConfig(args: {
  destinationKey: ManagedConversionDestinationKey;
  definition:
    | {
        configFields: readonly ProviderConfigField[];
      }
    | undefined;
  rawProviderConfig: unknown;
  errors: string[];
  warnings: string[];
}): Record<string, PrimitiveConfigValue> {
  if (args.rawProviderConfig === undefined) return {};
  if (!isRecord(args.rawProviderConfig)) {
    args.errors.push(`${args.destinationKey}.provider_config must be an object.`);
    return {};
  }

  const fieldsByKey = configFieldsByProviderConfigKey(args.definition);
  const providerConfig: Record<string, PrimitiveConfigValue> = {};

  for (const [key, value] of Object.entries(args.rawProviderConfig)) {
    const field = fieldsByKey.get(key);
    if (!field) {
      const severity = args.definition ? 'errors' : 'warnings';
      args[severity].push(`${args.destinationKey}.provider_config.${key} is not recognized.`);
      continue;
    }

    if (field.secret) {
      args.errors.push(
        `${args.destinationKey}.provider_config.${key} is a secret-backed field and must be configured through environment/secrets, not checked-in config.`,
      );
      continue;
    }

    if (!isPrimitiveConfigValue(value)) {
      args.errors.push(
        `${args.destinationKey}.provider_config.${key} must be string/number/boolean/null.`,
      );
      continue;
    }

    providerConfig[key] = value;
  }

  return providerConfig;
}

export function parseManagedConversionDestinationConfig(
  input: unknown,
): DestinationConfigParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ['Config root must be an object.'],
      warnings,
    };
  }

  if (input.version !== MANAGED_CONVERSION_DESTINATION_CONFIG_VERSION) {
    errors.push(`version must be ${MANAGED_CONVERSION_DESTINATION_CONFIG_VERSION}.`);
  }

  if (!Array.isArray(input.destinations)) {
    errors.push('destinations must be an array.');
    return { ok: false, errors, warnings };
  }

  const seen = new Set<ManagedConversionDestinationKey>();
  const destinations: ManagedConversionDestinationConfigEntry[] = [];

  input.destinations.forEach((rawEntry, index) => {
    if (!isRecord(rawEntry)) {
      errors.push(`destinations[${index}] must be an object.`);
      return;
    }

    const destinationKey = normalizeDestinationKey(rawEntry.destination_key);
    if (!destinationKey) {
      errors.push(`destinations[${index}].destination_key is not a known destination key.`);
      return;
    }

    if (seen.has(destinationKey)) {
      errors.push(`${destinationKey} is duplicated in destinations.`);
      return;
    }
    seen.add(destinationKey);

    const enabled = rawEntry.enabled;
    if (typeof enabled !== 'boolean') {
      errors.push(`${destinationKey}.enabled must be true or false.`);
      return;
    }

    const deliveryMode = parseDeliveryMode(rawEntry.delivery_mode, destinationKey);
    if (!deliveryMode) {
      errors.push(`${destinationKey}.delivery_mode must be manual or provider_api.`);
      return;
    }

    const expectedDeliveryMode = defaultDeliveryMode(destinationKey);
    if (deliveryMode !== expectedDeliveryMode) {
      errors.push(`${destinationKey}.delivery_mode must be ${expectedDeliveryMode}.`);
    }

    const configSource = parseConfigSource(rawEntry.config_source);
    if (!configSource) {
      errors.push(`${destinationKey}.config_source must be environment, config_file, or system.`);
      return;
    }

    const definition = providerDefinitionsByKey.get(destinationKey);
    const providerConfig = parseProviderConfig({
      destinationKey,
      definition,
      rawProviderConfig: rawEntry.provider_config,
      errors,
      warnings,
    });

    destinations.push({
      destination_key: destinationKey,
      enabled,
      delivery_mode: deliveryMode,
      config_source: configSource,
      provider_config: providerConfig,
    });
  });

  if (errors.length) return { ok: false, errors, warnings };
  return {
    ok: true,
    config: {
      version: MANAGED_CONVERSION_DESTINATION_CONFIG_VERSION,
      destinations,
    },
    warnings,
  };
}

export function buildProviderConversionDestinationFromConfig(args: {
  entry: ManagedConversionDestinationConfigEntry;
  nowMs: number;
  existing?: ProviderConversionDestination | null;
}): ProviderConversionDestination {
  const definition = MANAGED_CONVERSION_DESTINATIONS[args.entry.destination_key];

  return {
    destination_key: args.entry.destination_key,
    destination_label: definition.label,
    enabled: args.entry.enabled,
    delivery_mode: args.entry.delivery_mode,
    config_source: args.entry.config_source,
    provider_config: args.entry.provider_config,
    created_at_ms: args.existing?.created_at_ms ?? args.nowMs,
    updated_at_ms: args.nowMs,
  };
}

export function evaluateManagedConversionDestinationConfigReadiness(args: {
  config: ManagedConversionDestinationConfig;
  env?: Record<string, string | undefined>;
}): DestinationReadiness[] {
  const env = args.env ?? process.env;

  return args.config.destinations.map((entry) => {
    const destinationDefinition = MANAGED_CONVERSION_DESTINATIONS[entry.destination_key];
    if (!entry.enabled) {
      return {
        destination_key: entry.destination_key,
        destination_label: destinationDefinition.label,
        enabled: false,
        delivery_mode: entry.delivery_mode,
        mode: null,
        status: 'disabled',
        missing_config_keys: [],
        messages: ['Destination is disabled in config-as-code.'],
      };
    }

    if (entry.delivery_mode === 'manual') {
      return {
        destination_key: entry.destination_key,
        destination_label: destinationDefinition.label,
        enabled: true,
        delivery_mode: entry.delivery_mode,
        mode: 'manual',
        status: 'ready',
        missing_config_keys: [],
        messages: ['Manual export is enabled.'],
      };
    }

    const providerDefinition = providerDefinitionsByKey.get(entry.destination_key);
    if (!providerDefinition) {
      return {
        destination_key: entry.destination_key,
        destination_label: destinationDefinition.label,
        enabled: true,
        delivery_mode: entry.delivery_mode,
        mode: null,
        status: 'adapter_missing',
        missing_config_keys: [],
        messages: ['No provider adapter is implemented for this destination yet.'],
      };
    }

    const parsedConfig = providerDefinition.parseConfig(env, entry.provider_config);
    const mode = providerDefinition.getMode(parsedConfig);
    if (mode === 'disabled') {
      return {
        destination_key: entry.destination_key,
        destination_label: providerDefinition.label,
        enabled: true,
        delivery_mode: entry.delivery_mode,
        mode,
        status: 'disabled',
        missing_config_keys: [],
        messages: ['Provider mode is disabled.'],
      };
    }

    const missingConfigKeys =
      mode === 'dry_run'
        ? (providerDefinition.getMissingValidationConfigKeys?.(parsedConfig) ?? [])
        : (providerDefinition.getMissingDeliveryConfigKeys?.(parsedConfig) ?? []);

    return {
      destination_key: entry.destination_key,
      destination_label: providerDefinition.label,
      enabled: true,
      delivery_mode: entry.delivery_mode,
      mode,
      status: missingConfigKeys.length ? 'needs_destination_config' : 'ready',
      missing_config_keys: missingConfigKeys,
      messages: missingConfigKeys.length
        ? [`Missing required ${mode} configuration.`]
        : [`Provider ${mode} configuration is ready.`],
    };
  });
}
