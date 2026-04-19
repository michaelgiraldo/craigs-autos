export type ProviderHttpRequest = {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: Record<string, unknown> | string;
};

export type ProviderHttpResponse = {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: unknown;
  text: string;
};

export type ProviderHttpClient = (request: ProviderHttpRequest) => Promise<ProviderHttpResponse>;

export const fetchProviderHttpClient: ProviderHttpClient = async (request) => {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: typeof request.body === 'string' ? request.body : JSON.stringify(request.body),
  });
  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    text,
  };
};

export function readResponseHeader(
  response: ProviderHttpResponse,
  ...names: string[]
): string | null {
  for (const name of names) {
    const value = response.headers[name.toLowerCase()] ?? response.headers[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
