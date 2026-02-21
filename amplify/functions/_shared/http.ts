export type HttpMethodEvent = {
  requestContext?: { http?: { method?: string } } | null;
  httpMethod?: string;
};

export type HttpBodyEvent = {
  body?: string | null;
  isBase64Encoded?: boolean;
};

export type HttpQueryEvent = {
  queryStringParameters?: Record<string, string | undefined> | null;
  rawQueryString?: string | null;
};

export type HttpJsonResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export function getHttpMethod(event: HttpMethodEvent): string {
  return event?.requestContext?.http?.method ?? event?.httpMethod ?? '';
}

export function jsonResponse(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): HttpJsonResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

export function emptyResponse(
  statusCode = 204,
  headers: Record<string, string> = {},
): HttpJsonResponse {
  return {
    statusCode,
    headers,
    body: '',
  };
}

export function decodeBody(event: HttpBodyEvent): string | null {
  const raw = event?.body;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (event?.isBase64Encoded) {
    return Buffer.from(raw, 'base64').toString('utf8');
  }
  return raw;
}

export function getQueryParam(event: HttpQueryEvent, key: string): string | null {
  const queryValue = event?.queryStringParameters?.[key];
  if (typeof queryValue === 'string' && queryValue.trim()) {
    return queryValue.trim();
  }

  const rawQueryString = event?.rawQueryString;
  if (!rawQueryString) return null;
  const value = new URLSearchParams(rawQueryString).get(key);
  return value && value.trim() ? value.trim() : null;
}
