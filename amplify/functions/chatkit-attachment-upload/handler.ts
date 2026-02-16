import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const bucketName = process.env.CHATKIT_ATTACHMENT_BUCKET_NAME;
const maxAttachmentBytes = Number.parseInt(process.env.CHATKIT_ATTACHMENT_MAX_BYTES ?? '8000000', 10);
const allowedMimeTypes = new Set(
  (process.env.CHATKIT_ATTACHMENT_ALLOWED_MIME_TYPES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);
const s3 = bucketName ? new S3Client({}) : null;

type LambdaEvent = {
  headers?: Record<string, string | string[] | undefined> | null;
  requestContext?: { http?: { method?: string } } | null;
  httpMethod?: string;
  body?: string | null;
  rawPath?: string | null;
  rawQueryString?: string | null;
  isBase64Encoded?: boolean;
};

type LambdaResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
};

function json(statusCode: number, body: unknown): LambdaResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function binary(body: Buffer, contentType: string, filename: string): LambdaResponse {
  return {
    statusCode: 200,
    isBase64Encoded: true,
    headers: {
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Length': String(body.length),
      'Content-Disposition': `inline; filename="${sanitizeFilename(filename)}"`,
      'Cache-Control': 'private, max-age=86400',
    },
    body: body.toString('base64'),
  };
}

function normalizeHeaders(headers?: LambdaEvent['headers']): Record<string, string> {
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

function sanitizeFilename(value: string): string {
  const normalized = value.trim().replace(/\0/g, '').slice(0, 180);
  if (!normalized) return 'attachment';
  return normalized.replace(/[<>:"/\\|?*]/g, '_');
}

function sanitizeObjectId(value: string): string {
  if (!/^[A-Za-z0-9._/-]+$/.test(value)) return '';
  if (value.includes('..')) return '';
  return value;
}

function buildPreviewBaseUrl(event: LambdaEvent): string {
  const headers = normalizeHeaders(event.headers);
  const host = headers['x-forwarded-host'] || headers.host;
  if (!host) return '';

  const protoHeader = headers['x-forwarded-proto']?.split(',')[0]?.trim() ?? '';
  const protocol =
    protoHeader === 'http' || protoHeader === 'https'
      ? protoHeader
      : 'https';
  const path = event.rawPath?.startsWith('/') ? event.rawPath : '/';
  return `${protocol}://${host}${path}`;
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    case 'image/heic':
      return '.heic';
    case 'image/heif':
      return '.heif';
    default:
      return '';
  }
}

async function parseUploadedFile(event: LambdaEvent): Promise<{
  file?: File;
  threadId: string | null;
}> {
  if (!event.body) return { threadId: null };

  const headers = normalizeHeaders(event.headers);
  const contentType = headers['content-type'];
  if (!contentType || !contentType.toLowerCase().startsWith('multipart/form-data')) {
    return { threadId: null };
  }

  const body = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body);

  const request = new Request('https://chatkit-attachment.local/upload', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });

  const formData = await request.formData();
  const candidate =
    formData.get('file') ??
    formData.get('files');
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

async function putAttachment(
  file: File,
  threadId: string | null,
  previewBaseUrl: string
): Promise<{
  id: string;
  name: string;
  preview_url: string;
}> {
  const rawName = sanitizeFilename(file.name || 'image');
  const mimeType = file.type || 'application/octet-stream';
  const extension = extname(rawName) || extensionForMimeType(mimeType);
  const fileName = extension ? `${rawName.replace(extname(rawName), '')}${extension}` : rawName;
  const id = `att_${randomUUID()}`;
  const key = `chatkit-attachments/${id}${extension}`;

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > maxAttachmentBytes) {
    throw new Error('Attachment too large');
  }
  if (!allowedMimeTypes.has(mimeType)) {
    throw new Error(`Unsupported mime type: ${mimeType}`);
  }
  if (!s3 || !bucketName) {
    throw new Error('Attachment storage is not configured');
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: bytes,
      ContentType: mimeType,
      Metadata: {
        'attachment-id': id,
        'attachment-thread-id': threadId ?? '',
        'original-name': sanitizeFilename(fileName).slice(0, 1000),
      },
      ContentLength: bytes.length,
    })
  );

  return {
    id: key,
    name: fileName,
    preview_url: previewBaseUrl ? `${previewBaseUrl}?id=${encodeURIComponent(key)}` : '',
  };
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (typeof body === 'string') return Buffer.from(body);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(new Uint8Array(body));

  const streamBody = body as {
    arrayBuffer?: () => Promise<ArrayBuffer>;
    transformToByteArray?: () => Promise<Uint8Array | number[]>;
    on?: (event: 'data' | 'error' | 'end', listener: (value?: unknown) => void) => void;
  };

  if (typeof streamBody.arrayBuffer === 'function') {
    const arrayBuffer = await streamBody.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  if (typeof streamBody.transformToByteArray === 'function') {
    return Buffer.from(await streamBody.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const readable = streamBody;
    if (!readable.on || typeof readable.on !== 'function') {
      reject(new Error('Response body is not stream-like.'));
      return;
    }

    readable.on('data', (chunk: unknown) => {
      if (chunk instanceof Buffer) {
        chunks.push(chunk);
        return;
      }

      if (chunk instanceof ArrayBuffer) {
        chunks.push(Buffer.from(new Uint8Array(chunk)));
        return;
      }

      if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
        return;
      }

      if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk));
        return;
      }

      chunks.push(Buffer.from(String(chunk)));
    });
    readable.on('error', (error: unknown) => reject(error instanceof Error ? error : new Error(String(error))));
    readable.on('end', () => resolve());
  });

  return Buffer.concat(chunks);
}

async function fetchAttachmentForDownload(id: string): Promise<LambdaResponse> {
  if (!id) {
    return json(400, { error: 'Missing attachment id.' });
  }
  const sanitizedId = sanitizeObjectId(id);
  if (!sanitizedId || sanitizedId !== id) {
    return json(400, { error: 'Invalid attachment id.' });
  }

  if (!s3 || !bucketName) {
    return json(500, { error: 'Attachment storage is not configured.' });
  }

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: sanitizedId,
    })
  );

  const bytes = await streamToBuffer(response.Body);
  const contentType = response.ContentType || 'application/octet-stream';
  const downloadName = sanitizeFilename(sanitizedId.split('/').pop() ?? 'attachment');

  return binary(bytes, contentType, downloadName);
}

function getMethod(event: LambdaEvent): string {
  const candidate = event.requestContext?.http?.method ?? event.httpMethod;
  return typeof candidate === 'string' ? candidate.toUpperCase() : 'GET';
}

function getQueryParam(event: LambdaEvent, name: string): string | null {
  const source = event.rawQueryString ?? '';
  const params = new URLSearchParams(source);
  const value = params.get(name);
  return value ? value.trim() : null;
}

export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  try {
    const method = getMethod(event);

    if (method === 'GET') {
      const attachmentId = getQueryParam(event, 'id');
      return fetchAttachmentForDownload(attachmentId ?? '');
    }

    if (method !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }

    const previewBaseUrl = buildPreviewBaseUrl(event);
    const { file, threadId } = await parseUploadedFile(event);
    if (!file) {
      return json(400, { error: 'No file uploaded. Include a multipart file field named "file".' });
    }

    const uploaded = await putAttachment(file, threadId, previewBaseUrl);
    const mimeType = file.type || 'application/octet-stream';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: uploaded.id,
        name: uploaded.name,
        type: 'image',
        mime_type: mimeType,
        preview_url: uploaded.preview_url,
      }),
    };
  } catch (err: any) {
    if (err?.message === 'Attachment too large') {
      return json(413, { error: 'Attachment exceeds allowed size.' });
    }
    if (err?.message?.startsWith('Unsupported mime type')) {
      return json(415, { error: 'Unsupported attachment format.' });
    }
    if (err?.message === 'Attachment storage is not configured') {
      return json(500, { error: 'Attachment storage is not configured.' });
    }

    console.error('Attachment upload failed', err?.name, err?.message);
    return json(500, { error: 'Attachment upload failed.' });
  }
};
