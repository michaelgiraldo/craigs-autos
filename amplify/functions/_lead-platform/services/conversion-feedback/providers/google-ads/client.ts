import type { ManagedConversionFeedbackDeliveryResult } from '../../adapter-types.ts';
import { isAuthOrConfigStatus, isRetryableStatus } from '../../config.ts';
import { type ProviderHttpClient, readResponseHeader } from '../../provider-http.ts';
import type { GoogleAdsManagedConversionConfig } from './config.ts';
import type { GoogleAdsUploadClickConversionsRequest } from './payload.ts';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function compactString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function summarizeGoogleError(body: unknown, fallback: string): string {
  const record = asRecord(body);
  const error = asRecord(record.error);
  const message = compactString(error.message) ?? compactString(record.message);
  return message ?? fallback;
}

async function resolveGoogleAdsAccessToken(args: {
  config: GoogleAdsManagedConversionConfig;
  httpClient: ProviderHttpClient;
}): Promise<
  | { ok: true; accessToken: string; tokenPayload: Record<string, unknown> | null }
  | { ok: false; result: ManagedConversionFeedbackDeliveryResult }
> {
  if (args.config.accessToken) {
    return { ok: true, accessToken: args.config.accessToken, tokenPayload: null };
  }

  if (!args.config.refreshToken || !args.config.clientId || !args.config.clientSecret) {
    return {
      ok: false,
      result: {
        status: 'needs_destination_config',
        message: 'Google Ads OAuth refresh configuration is missing.',
        errorCode: 'google_ads_missing_oauth_refresh_config',
        payload: {
          missing_config_keys: [
            !args.config.refreshToken ? 'GOOGLE_ADS_REFRESH_TOKEN' : null,
            !args.config.clientId ? 'GOOGLE_ADS_CLIENT_ID' : null,
            !args.config.clientSecret ? 'GOOGLE_ADS_CLIENT_SECRET' : null,
          ].filter(Boolean),
        },
      },
    };
  }

  const response = await args.httpClient({
    url: args.config.tokenEndpoint,
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: args.config.refreshToken,
      client_id: args.config.clientId,
      client_secret: args.config.clientSecret,
    }).toString(),
  });

  if (!response.ok) {
    return {
      ok: false,
      result: {
        status: 'needs_destination_config',
        message: summarizeGoogleError(
          response.body,
          `Google OAuth token refresh returned ${response.status}.`,
        ),
        errorCode: 'google_ads_oauth_refresh_failed',
        retryable: isRetryableStatus(response.status),
        payload: {
          http_status: response.status,
          response_body: response.body,
        },
      },
    };
  }

  const body = asRecord(response.body);
  const accessToken = compactString(body.access_token);
  if (!accessToken) {
    return {
      ok: false,
      result: {
        status: 'needs_destination_config',
        message: 'Google OAuth token refresh did not return an access token.',
        errorCode: 'google_ads_oauth_refresh_missing_access_token',
        payload: {
          http_status: response.status,
          response_body: response.body,
        },
      },
    };
  }

  return { ok: true, accessToken, tokenPayload: body };
}

export async function uploadGoogleAdsClickConversions(args: {
  config: GoogleAdsManagedConversionConfig;
  request: GoogleAdsUploadClickConversionsRequest;
  httpClient: ProviderHttpClient;
}): Promise<ManagedConversionFeedbackDeliveryResult> {
  if (!args.config.developerToken) {
    return {
      status: 'needs_destination_config',
      message: 'Google Ads developer token is missing.',
      errorCode: 'google_ads_missing_api_credentials',
      payload: {
        missing_config_keys: ['GOOGLE_ADS_DEVELOPER_TOKEN'],
      },
    };
  }

  const token = await resolveGoogleAdsAccessToken({
    config: args.config,
    httpClient: args.httpClient,
  });
  if (!token.ok) return token.result;

  const url = `${args.config.endpointBase}/${args.config.apiVersion}/customers/${args.request.customerId}:uploadClickConversions`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${token.accessToken}`,
    'content-type': 'application/json',
    'developer-token': args.config.developerToken,
  };
  if (args.config.loginCustomerId) headers['login-customer-id'] = args.config.loginCustomerId;

  const response = await args.httpClient({
    url,
    method: 'POST',
    headers,
    body: args.request.body,
  });
  const providerResponseId =
    readResponseHeader(response, 'request-id', 'x-request-id', 'googleads-request-id') ??
    compactString(asRecord(response.body).jobId);

  if (!response.ok) {
    const configError = isAuthOrConfigStatus(response.status);
    return {
      status: configError ? 'needs_destination_config' : 'failed',
      message: summarizeGoogleError(response.body, `Google Ads API returned ${response.status}.`),
      providerResponseId,
      errorCode: configError ? 'google_ads_api_config_error' : 'google_ads_api_error',
      retryable: isRetryableStatus(response.status),
      payload: {
        http_status: response.status,
        response_body: response.body,
      },
    };
  }

  const body = asRecord(response.body);
  const results = arrayValue(body.results);
  const partialFailureError = body.partialFailureError ?? null;
  if (partialFailureError && !results.length) {
    return {
      status: 'failed',
      message: 'Google Ads rejected the conversion feedback request.',
      providerResponseId,
      errorCode: 'google_ads_partial_failure',
      payload: {
        http_status: response.status,
        response_body: response.body,
      },
    };
  }

  if (args.request.body.validateOnly) {
    return {
      status: partialFailureError ? 'warning' : 'validated',
      message: partialFailureError
        ? 'Google Ads validate-only request returned warnings.'
        : 'Google Ads validate-only request passed provider validation.',
      providerResponseId,
      errorCode: partialFailureError ? 'google_ads_validate_only_warning' : null,
      payload: {
        mode: 'test',
        http_status: response.status,
        response_body: response.body,
        access_token_refreshed: Boolean(token.tokenPayload),
      },
    };
  }

  return {
    status: partialFailureError ? 'warning' : 'accepted',
    message: partialFailureError
      ? 'Google Ads accepted the request with partial-failure diagnostics.'
      : 'Google Ads accepted the conversion feedback request.',
    providerResponseId,
    errorCode: partialFailureError ? 'google_ads_partial_failure_warning' : null,
    payload: {
      mode: 'live',
      http_status: response.status,
      response_body: response.body,
      access_token_refreshed: Boolean(token.tokenPayload),
    },
  };
}
