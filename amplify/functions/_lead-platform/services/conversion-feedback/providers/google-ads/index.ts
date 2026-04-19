export { createGoogleAdsManagedConversionAdapter } from './adapter.ts';
export {
  GOOGLE_ADS_CONFIG_FIELDS,
  buildGoogleAdsConversionActionResourceName,
  getGoogleAdsMissingLiveConfigKeys,
  normalizeGoogleAdsCustomerId,
  parseGoogleAdsManagedConversionConfig,
  type GoogleAdsManagedConversionConfig,
} from './config.ts';
export { googleAdsProviderDefinition } from './definition.ts';
export {
  buildGoogleAdsUploadClickConversionsPayload,
  type GoogleAdsClickConversionPayload,
  type GoogleAdsUploadClickConversionsRequest,
} from './payload.ts';
