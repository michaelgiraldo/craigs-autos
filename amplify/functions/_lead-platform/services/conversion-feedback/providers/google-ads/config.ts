import type { ProviderExecutionMode } from '../../adapter-types.ts';
import {
  normalizeCurrencyCode,
  parseBoolean,
  parseNumber,
  parseProviderExecutionMode,
  readConfigValue,
  readStringConfigValue,
  trimToNull,
  type ProviderRawConfig,
} from '../../config.ts';

export type GoogleAdsConsentStatus = 'GRANTED' | 'DENIED';

export type GoogleAdsManagedConversionConfig = {
  mode: ProviderExecutionMode;
  apiVersion: string;
  endpointBase: string;
  customerId: string | null;
  conversionActionResourceName: string | null;
  conversionActionId: string | null;
  defaultConversionValue: number | null;
  currencyCode: string | null;
  adUserDataConsent: GoogleAdsConsentStatus | null;
  accountDefaultConsentConfigured: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  clientId: string | null;
  clientSecret: string | null;
  tokenEndpoint: string;
  developerToken: string | null;
  loginCustomerId: string | null;
};

function parseConsent(value: unknown): GoogleAdsConsentStatus | null {
  const normalized = trimToNull(value)?.toUpperCase();
  return normalized === 'GRANTED' || normalized === 'DENIED' ? normalized : null;
}

export function normalizeGoogleAdsCustomerId(value: unknown): string | null {
  const normalized = trimToNull(value)?.replaceAll('-', '') ?? null;
  return normalized && /^\d+$/u.test(normalized) ? normalized : null;
}

export function buildGoogleAdsConversionActionResourceName(args: {
  customerId: string | null;
  conversionActionResourceName: string | null;
  conversionActionId: string | null;
}): string | null {
  if (args.conversionActionResourceName) return args.conversionActionResourceName;
  if (!args.customerId || !args.conversionActionId) return null;
  return `customers/${args.customerId}/conversionActions/${args.conversionActionId}`;
}

export function parseGoogleAdsManagedConversionConfig(
  env: Record<string, string | undefined>,
  providerConfig: ProviderRawConfig = {},
): GoogleAdsManagedConversionConfig {
  const modeValue =
    providerConfig.mode ??
    env.GOOGLE_ADS_CONVERSION_FEEDBACK_MODE ??
    env.GOOGLE_ADS_MODE ??
    'dry_run';
  const customerId = normalizeGoogleAdsCustomerId(
    readConfigValue(env, providerConfig, 'GOOGLE_ADS_CUSTOMER_ID', 'customer_id'),
  );
  const conversionActionId = normalizeGoogleAdsCustomerId(
    readConfigValue(env, providerConfig, 'GOOGLE_ADS_CONVERSION_ACTION_ID', 'conversion_action_id'),
  );
  const conversionActionResourceName = readStringConfigValue(
    env,
    providerConfig,
    'GOOGLE_ADS_CONVERSION_ACTION_RESOURCE_NAME',
    'conversion_action_resource_name',
  );

  return {
    mode: parseProviderExecutionMode(modeValue),
    apiVersion:
      readStringConfigValue(env, providerConfig, 'GOOGLE_ADS_API_VERSION', 'api_version') ?? 'v22',
    endpointBase:
      readStringConfigValue(env, providerConfig, 'GOOGLE_ADS_ENDPOINT_BASE', 'endpoint_base') ??
      'https://googleads.googleapis.com',
    customerId,
    conversionActionResourceName,
    conversionActionId,
    defaultConversionValue: parseNumber(
      readConfigValue(
        env,
        providerConfig,
        'GOOGLE_ADS_DEFAULT_CONVERSION_VALUE',
        'default_conversion_value',
      ),
    ),
    currencyCode: normalizeCurrencyCode(
      readConfigValue(env, providerConfig, 'GOOGLE_ADS_CURRENCY_CODE', 'currency_code'),
    ),
    adUserDataConsent: parseConsent(
      readConfigValue(
        env,
        providerConfig,
        'GOOGLE_ADS_AD_USER_DATA_CONSENT',
        'ad_user_data_consent',
      ),
    ),
    accountDefaultConsentConfigured: parseBoolean(
      readConfigValue(
        env,
        providerConfig,
        'GOOGLE_ADS_ACCOUNT_DEFAULT_CONSENT_CONFIGURED',
        'account_default_consent_configured',
      ),
    ),
    accessToken: readStringConfigValue(
      env,
      providerConfig,
      'GOOGLE_ADS_ACCESS_TOKEN',
      'access_token',
    ),
    refreshToken: readStringConfigValue(
      env,
      providerConfig,
      'GOOGLE_ADS_REFRESH_TOKEN',
      'refresh_token',
    ),
    clientId: readStringConfigValue(env, providerConfig, 'GOOGLE_ADS_CLIENT_ID', 'client_id'),
    clientSecret: readStringConfigValue(
      env,
      providerConfig,
      'GOOGLE_ADS_CLIENT_SECRET',
      'client_secret',
    ),
    tokenEndpoint:
      readStringConfigValue(env, providerConfig, 'GOOGLE_ADS_TOKEN_ENDPOINT', 'token_endpoint') ??
      'https://oauth2.googleapis.com/token',
    developerToken: readStringConfigValue(
      env,
      providerConfig,
      'GOOGLE_ADS_DEVELOPER_TOKEN',
      'developer_token',
    ),
    loginCustomerId: normalizeGoogleAdsCustomerId(
      readConfigValue(env, providerConfig, 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', 'login_customer_id'),
    ),
  };
}

export function getGoogleAdsMissingDryRunConfigKeys(
  config: GoogleAdsManagedConversionConfig,
): string[] {
  const conversionAction = buildGoogleAdsConversionActionResourceName({
    customerId: config.customerId,
    conversionActionResourceName: config.conversionActionResourceName,
    conversionActionId: config.conversionActionId,
  });

  return [
    config.customerId ? null : 'GOOGLE_ADS_CUSTOMER_ID',
    conversionAction
      ? null
      : 'GOOGLE_ADS_CONVERSION_ACTION_RESOURCE_NAME or GOOGLE_ADS_CONVERSION_ACTION_ID',
    config.adUserDataConsent || config.accountDefaultConsentConfigured
      ? null
      : 'GOOGLE_ADS_AD_USER_DATA_CONSENT or GOOGLE_ADS_ACCOUNT_DEFAULT_CONSENT_CONFIGURED',
  ].filter((value): value is string => Boolean(value));
}

export function getGoogleAdsMissingLiveConfigKeys(
  config: GoogleAdsManagedConversionConfig,
): string[] {
  const canRefreshAccessToken =
    config.refreshToken && config.clientId && config.clientSecret && config.tokenEndpoint;
  return [
    ...getGoogleAdsMissingDryRunConfigKeys(config),
    config.accessToken || canRefreshAccessToken
      ? null
      : 'GOOGLE_ADS_ACCESS_TOKEN or GOOGLE_ADS_REFRESH_TOKEN/CLIENT_ID/CLIENT_SECRET',
    config.developerToken ? null : 'GOOGLE_ADS_DEVELOPER_TOKEN',
  ].filter((value): value is string => Boolean(value));
}
