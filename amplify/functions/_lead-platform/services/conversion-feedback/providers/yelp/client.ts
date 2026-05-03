import type { ManagedConversionFeedbackDeliveryResult } from '../../adapter-types.ts';
import { isRetryableStatus } from '../../config.ts';
import { type ProviderHttpClient, readResponseHeader } from '../../provider-http.ts';
import type { YelpManagedConversionConfig } from './config.ts';
import type { YelpConversionRequest } from './payload.ts';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function compactString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function summarizeYelpError(body: unknown, fallback: string): string {
  const record = asRecord(body);
  const error = asRecord(record.error);
  return (
    compactString(error.description) ??
    compactString(error.message) ??
    compactString(record.message) ??
    fallback
  );
}

export async function uploadYelpConversionEvent(args: {
  config: YelpManagedConversionConfig;
  request: YelpConversionRequest;
  httpClient: ProviderHttpClient;
}): Promise<ManagedConversionFeedbackDeliveryResult> {
  if (!args.config.apiKey) {
    return {
      status: 'needs_destination_config',
      message: 'Yelp Conversions API key is missing.',
      errorCode: 'yelp_missing_api_key',
      payload: {
        missing_config_keys: ['YELP_API_KEY'],
      },
    };
  }

  const response = await args.httpClient({
    url: `${args.config.endpointBase}/v3/conversion/event`,
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${args.config.apiKey}`,
      'content-type': 'application/json',
    },
    body: args.request,
  });
  const providerResponseId = readResponseHeader(response, 'request-id', 'x-request-id');

  if (response.status === 202) {
    return {
      status: args.request.test_event ? 'validated' : 'accepted',
      message: args.request.test_event
        ? 'Yelp Conversions API accepted the test event.'
        : 'Yelp Conversions API accepted the conversion event.',
      providerResponseId,
      payload: {
        mode: args.request.test_event ? 'test' : 'live',
        http_status: response.status,
        response_body: response.body,
      },
    };
  }

  const configError = response.status === 401 || response.status === 403 || response.status === 404;
  return {
    status: configError ? 'needs_destination_config' : 'failed',
    message: summarizeYelpError(response.body, `Yelp Conversions API returned ${response.status}.`),
    providerResponseId,
    errorCode: configError ? 'yelp_api_config_error' : 'yelp_api_error',
    retryable: isRetryableStatus(response.status),
    payload: {
      http_status: response.status,
      response_body: response.body,
    },
  };
}
