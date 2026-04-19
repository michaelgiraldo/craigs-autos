import {
  defineManagedConversionProvider,
  type ManagedConversionProviderDefinition,
} from '../../provider-definition.ts';
import { uploadGoogleAdsClickConversions } from './client.ts';
import {
  GOOGLE_ADS_CONFIG_FIELDS,
  getGoogleAdsMissingDryRunConfigKeys,
  getGoogleAdsMissingLiveConfigKeys,
  parseGoogleAdsManagedConversionConfig,
  type GoogleAdsManagedConversionConfig,
} from './config.ts';
import {
  buildGoogleAdsUploadClickConversionsPayload,
  type GoogleAdsUploadClickConversionsRequest,
} from './payload.ts';

export const googleAdsProviderDefinition = defineManagedConversionProvider({
  key: 'google_ads',
  label: 'Google Ads',
  modes: ['disabled', 'dry_run', 'test', 'live'],
  configFields: GOOGLE_ADS_CONFIG_FIELDS,
  parseConfig: parseGoogleAdsManagedConversionConfig,
  getMode: (config) => config.mode,
  buildPayload({ context, config }) {
    return buildGoogleAdsUploadClickConversionsPayload({
      config,
      item: context.item,
      decision: context.decision,
      leadRecord: context.leadRecord,
      contact: context.contact,
    });
  },
  getMissingValidationConfigKeys: getGoogleAdsMissingDryRunConfigKeys,
  getMissingDeliveryConfigKeys: getGoogleAdsMissingLiveConfigKeys,
  summarizeDryRunPayload({ build }) {
    const conversion = build.request.body.conversions[0];
    return {
      user_identifier_count: conversion.userIdentifiers?.length ?? 0,
      has_click_id: Boolean(conversion.gclid || conversion.gbraid || conversion.wbraid),
    };
  },
  deliver({ config, build, deps }) {
    return uploadGoogleAdsClickConversions({
      config,
      request: build.request,
      httpClient: deps.httpClient,
    });
  },
} satisfies ManagedConversionProviderDefinition<
  GoogleAdsManagedConversionConfig,
  GoogleAdsUploadClickConversionsRequest
>);
