import type { LambdaEvent, ParsedUpload } from './types.ts';

export function normalizeHeaders(headers?: LambdaEvent['headers']): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (!headers) return normalized;

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      normalized[key.toLowerCase()] = value;
      continue;
    }

    if (Array.isArray(value) && value[0]) {
      normalized[key.toLowerCase()] = value[0];
    }
  }

  return normalized;
}

export function getMethod(event: LambdaEvent): string {
  const candidate = event.requestContext?.http?.method ?? event.httpMethod;
  return typeof candidate === 'string' ? candidate.toUpperCase() : 'GET';
}

export function getQueryParam(event: LambdaEvent, name: string): string | null {
  const source = event.rawQueryString ?? '';
  const params = new URLSearchParams(source);
  const value = params.get(name);
  return value ? value.trim() : null;
}

export function buildPreviewBaseUrl(event: LambdaEvent): string {
  const headers = normalizeHeaders(event.headers);
  const host = headers['x-forwarded-host'] || headers.host;
  if (!host) return '';

  const protoHeader = headers['x-forwarded-proto']?.split(',')[0]?.trim() ?? '';
  const protocol = protoHeader === 'http' || protoHeader === 'https' ? protoHeader : 'https';
  const path = event.rawPath?.startsWith('/') ? event.rawPath : '/';
  return `${protocol}://${host}${path}`;
}

export async function parseUploadedFile(event: LambdaEvent): Promise<ParsedUpload> {
  if (!event.body) return { threadId: null };

  const headers = normalizeHeaders(event.headers);
  const contentType = headers['content-type'];
  if (!contentType?.toLowerCase().startsWith('multipart/form-data')) {
    return { threadId: null };
  }

  const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body);

  const request = new Request('https://chatkit-attachment.local/upload', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });

  const formData = await request.formData();
  const candidate = formData.get('file') ?? formData.get('files');
  const threadIdValue = formData.get('thread_id');
  const threadId = typeof threadIdValue === 'string' ? threadIdValue : null;

  if (candidate instanceof File) {
    return { file: candidate, threadId };
  }

  const allFiles = formData.getAll('file');
  const firstFile = allFiles.find((value) => value instanceof File);
  if (firstFile instanceof File) {
    return { file: firstFile, threadId };
  }

  return { threadId };
}
