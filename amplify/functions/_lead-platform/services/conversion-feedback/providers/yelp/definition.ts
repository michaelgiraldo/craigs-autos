import {
  defineManagedConversionProvider,
  type ManagedConversionProviderDefinition,
} from '../../provider-definition.ts';
import { uploadYelpConversionEvent } from './client.ts';
import {
  YELP_CONFIG_FIELDS,
  getYelpMissingLiveConfigKeys,
  parseYelpManagedConversionConfig,
  type YelpManagedConversionConfig,
} from './config.ts';
import { buildYelpConversionPayload, type YelpConversionRequest } from './payload.ts';

export const yelpProviderDefinition = defineManagedConversionProvider({
  key: 'yelp_ads',
  label: 'Yelp Ads',
  modes: ['disabled', 'dry_run', 'test', 'live'],
  configFields: YELP_CONFIG_FIELDS,
  parseConfig: parseYelpManagedConversionConfig,
  getMode: (config) => config.mode,
  buildPayload({ context, config }) {
    return buildYelpConversionPayload({
      config,
      item: context.item,
      decision: context.decision,
      leadRecord: context.leadRecord,
      contact: context.contact,
    });
  },
  getMissingDeliveryConfigKeys: getYelpMissingLiveConfigKeys,
  summarizeDryRunPayload({ build }) {
    return {
      event_name: build.request.event.event_name,
      has_yelp_lead_id: Boolean(build.request.event.user_data?.lead_id),
    };
  },
  deliver({ config, build, deps }) {
    return uploadYelpConversionEvent({
      config,
      request: build.request,
      httpClient: deps.httpClient,
    });
  },
} satisfies ManagedConversionProviderDefinition<
  YelpManagedConversionConfig,
  YelpConversionRequest
>);
