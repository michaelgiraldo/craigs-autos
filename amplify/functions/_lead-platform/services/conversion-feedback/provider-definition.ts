import type { ManagedConversionDestinationKey } from '@craigs/contracts/managed-conversion-contract';
import type {
  ManagedConversionFeedbackAdapter,
  ManagedConversionFeedbackContext,
  ManagedConversionFeedbackDeliveryResult,
  ProviderExecutionMode,
} from './adapter-types.ts';
import { fetchProviderHttpClient, type ProviderHttpClient } from './provider-http.ts';

export type ProviderConfigField = {
  name: string;
  envKey: string;
  providerConfigKey: string;
  defaultValue?: string;
  secret?: boolean;
  requiredForModes?: ProviderExecutionMode[];
  description: string;
};

export type ProviderPayloadBuildSuccess<TRequest> = {
  ok: true;
  request: TRequest;
  signalKeys: string[];
  warnings: string[];
};

export type ProviderPayloadBuildFailure = {
  ok: false;
  status: 'needs_destination_config' | 'needs_signal';
  errorCode: string;
  message: string;
  missingConfigKeys?: string[];
};

export type ProviderPayloadBuildResult<TRequest> =
  | ProviderPayloadBuildSuccess<TRequest>
  | ProviderPayloadBuildFailure;

export type ProviderDeliveryDependencies = {
  httpClient: ProviderHttpClient;
};

export type ManagedConversionProviderDefinition<TConfig, TRequest> = {
  key: ManagedConversionDestinationKey;
  label: string;
  modes: readonly ProviderExecutionMode[];
  configFields: readonly ProviderConfigField[];
  canHandle?: ManagedConversionFeedbackAdapter['canHandle'];
  parseConfig(
    env: Record<string, string | undefined>,
    providerConfig: Record<string, string | number | boolean | null | undefined>,
  ): TConfig;
  getMode(config: TConfig): ProviderExecutionMode;
  buildPayload(args: {
    context: ManagedConversionFeedbackContext;
    config: TConfig;
  }): ProviderPayloadBuildResult<TRequest>;
  getMissingValidationConfigKeys?(config: TConfig): string[];
  getMissingDeliveryConfigKeys?(config: TConfig): string[];
  summarizeDryRunPayload?(args: {
    context: ManagedConversionFeedbackContext;
    config: TConfig;
    build: ProviderPayloadBuildSuccess<TRequest>;
  }): Record<string, unknown>;
  deliver(args: {
    context: ManagedConversionFeedbackContext;
    config: TConfig;
    build: ProviderPayloadBuildSuccess<TRequest>;
    deps: ProviderDeliveryDependencies;
  }): Promise<ManagedConversionFeedbackDeliveryResult>;
};

export function defineManagedConversionProvider<TConfig, TRequest>(
  definition: ManagedConversionProviderDefinition<TConfig, TRequest>,
): ManagedConversionProviderDefinition<TConfig, TRequest> {
  return definition;
}

export function createAdapterFromProviderDefinition<TConfig, TRequest>(
  definition: ManagedConversionProviderDefinition<TConfig, TRequest>,
  args: { env?: Record<string, string | undefined>; httpClient?: ProviderHttpClient } = {},
): ManagedConversionFeedbackAdapter {
  const env = args.env ?? process.env;
  const httpClient = args.httpClient ?? fetchProviderHttpClient;
  const serializeRequest = (request: TRequest): Record<string, unknown> =>
    request && typeof request === 'object' && !Array.isArray(request)
      ? (request as Record<string, unknown>)
      : { value: request };

  return {
    key: definition.key,
    label: definition.label,
    canHandle(destination) {
      return definition.canHandle
        ? definition.canHandle(destination)
        : destination.destination_key === definition.key;
    },
    async deliver(context) {
      const config = definition.parseConfig(env, context.destination.provider_config);
      const mode = definition.getMode(config);
      if (mode === 'disabled') {
        return {
          status: 'needs_destination_config',
          message: `${definition.label} conversion feedback is disabled.`,
          errorCode: `${definition.key}_disabled`,
        };
      }

      const build = definition.buildPayload({ context, config });
      if (!build.ok) {
        return {
          status: build.status,
          message: build.message,
          errorCode: build.errorCode,
          payload: {
            missing_config_keys: build.missingConfigKeys ?? [],
          },
        };
      }

      if (mode === 'dry_run') {
        return {
          status: 'validated',
          message: `${definition.label} conversion payload validated in dry-run mode; no provider API was called.`,
          payload: {
            mode,
            signal_keys: build.signalKeys,
            warnings: build.warnings,
            request: serializeRequest(build.request),
            ...(definition.summarizeDryRunPayload?.({ context, config, build }) ?? {}),
          },
        };
      }

      const missingDeliveryConfigKeys = definition.getMissingDeliveryConfigKeys?.(config) ?? [];
      if (missingDeliveryConfigKeys.length) {
        return {
          status: 'needs_destination_config',
          message: `${definition.label} API delivery is missing required configuration: ${missingDeliveryConfigKeys.join(', ')}.`,
          errorCode: `${definition.key}_missing_live_config`,
          payload: {
            missing_config_keys: missingDeliveryConfigKeys,
            mode,
          },
        };
      }

      return definition.deliver({
        context,
        config,
        build,
        deps: { httpClient },
      });
    },
  };
}
