import type { ManagedConversionFeedbackAdapter } from '../../adapter-types.ts';
import { fetchProviderHttpClient, type ProviderHttpClient } from '../../provider-http.ts';
import { getYelpMissingLiveConfigKeys, parseYelpManagedConversionConfig } from './config.ts';
import { uploadYelpConversionEvent } from './client.ts';
import { buildYelpConversionPayload } from './payload.ts';

export function createYelpManagedConversionAdapter(
  args: { env?: Record<string, string | undefined>; httpClient?: ProviderHttpClient } = {},
): ManagedConversionFeedbackAdapter {
  const env = args.env ?? process.env;
  const httpClient = args.httpClient ?? fetchProviderHttpClient;

  return {
    key: 'yelp_ads',
    label: 'Yelp Ads',
    canHandle(destination) {
      return destination.destination_key === 'yelp_ads';
    },
    async deliver(context) {
      const config = parseYelpManagedConversionConfig(env, context.destination.provider_config);
      if (config.mode === 'disabled') {
        return {
          status: 'needs_destination_config',
          message: 'Yelp conversion feedback is disabled.',
          errorCode: 'yelp_disabled',
        };
      }

      const result = buildYelpConversionPayload({
        config,
        item: context.item,
        decision: context.decision,
        leadRecord: context.leadRecord,
        contact: context.contact,
      });
      if (!result.ok) {
        return {
          status: result.status,
          message: result.message,
          errorCode: result.errorCode,
        };
      }

      if (config.mode === 'dry_run') {
        return {
          status: 'validated',
          message: 'Yelp conversion payload validated in dry-run mode; no provider API was called.',
          payload: {
            mode: config.mode,
            signal_keys: result.signalKeys,
            warnings: result.warnings,
            request: result.request,
          },
        };
      }

      const missingLiveConfigKeys = getYelpMissingLiveConfigKeys(config);
      if (missingLiveConfigKeys.length) {
        return {
          status: 'needs_destination_config',
          message: `Yelp API delivery is missing required configuration: ${missingLiveConfigKeys.join(', ')}.`,
          errorCode: 'yelp_missing_live_config',
          payload: {
            missing_config_keys: missingLiveConfigKeys,
            mode: config.mode,
          },
        };
      }

      return uploadYelpConversionEvent({
        config,
        request: result.request,
        httpClient,
      });
    },
  };
}
