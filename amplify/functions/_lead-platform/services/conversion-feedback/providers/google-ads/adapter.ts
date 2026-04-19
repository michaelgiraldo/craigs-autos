import type { ManagedConversionFeedbackAdapter } from '../../adapter-types.ts';
import { fetchProviderHttpClient, type ProviderHttpClient } from '../../provider-http.ts';
import {
  getGoogleAdsMissingLiveConfigKeys,
  parseGoogleAdsManagedConversionConfig,
} from './config.ts';
import { uploadGoogleAdsClickConversions } from './client.ts';
import { buildGoogleAdsUploadClickConversionsPayload } from './payload.ts';

export function createGoogleAdsManagedConversionAdapter(
  args: { env?: Record<string, string | undefined>; httpClient?: ProviderHttpClient } = {},
): ManagedConversionFeedbackAdapter {
  const env = args.env ?? process.env;
  const httpClient = args.httpClient ?? fetchProviderHttpClient;

  return {
    key: 'google_ads',
    label: 'Google Ads',
    canHandle(destination) {
      return destination.destination_key === 'google_ads';
    },
    async deliver(context) {
      const config = parseGoogleAdsManagedConversionConfig(
        env,
        context.destination.provider_config,
      );
      if (config.mode === 'disabled') {
        return {
          status: 'needs_destination_config',
          message: 'Google Ads conversion feedback is disabled.',
          errorCode: 'google_ads_disabled',
        };
      }

      const result = buildGoogleAdsUploadClickConversionsPayload({
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
          payload: {
            missing_config_keys: result.missingConfigKeys ?? [],
          },
        };
      }

      if (config.mode === 'dry_run') {
        const conversion = result.request.body.conversions[0];
        return {
          status: 'validated',
          message:
            'Google Ads ClickConversion payload validated in dry-run mode; no provider API was called.',
          payload: {
            mode: config.mode,
            signal_keys: result.signalKeys,
            warnings: result.warnings,
            request: result.request,
            user_identifier_count: conversion.userIdentifiers?.length ?? 0,
            has_click_id: Boolean(conversion.gclid || conversion.gbraid || conversion.wbraid),
          },
        };
      }

      const missingLiveConfigKeys = getGoogleAdsMissingLiveConfigKeys(config);
      if (missingLiveConfigKeys.length) {
        return {
          status: 'needs_destination_config',
          message: `Google Ads API delivery is missing required configuration: ${missingLiveConfigKeys.join(', ')}.`,
          errorCode: 'google_ads_missing_live_config',
          payload: {
            missing_config_keys: missingLiveConfigKeys,
            mode: config.mode,
          },
        };
      }

      return uploadGoogleAdsClickConversions({
        config,
        request: result.request,
        httpClient,
      });
    },
  };
}
