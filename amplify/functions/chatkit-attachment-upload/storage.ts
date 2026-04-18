import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  assertAttachmentCanBeStored,
  assertAttachmentId,
  assertStorageConfigured,
  normalizeAttachmentFilename,
  sanitizeFilename,
} from './policy.ts';
import type { AttachmentUploadConfig, DownloadedAttachment, StoredAttachment } from './types.ts';

const s3 = new S3Client({});

export async function putAttachment({
  config,
  file,
  previewBaseUrl,
  threadId,
}: {
  config: AttachmentUploadConfig;
  file: File;
  previewBaseUrl: string;
  threadId: string | null;
}): Promise<StoredAttachment> {
  const mimeType = file.type || 'application/octet-stream';
  const fileName = normalizeAttachmentFilename(file.name || 'image', mimeType);
  const extension = extname(fileName);
  const id = `att_${randomUUID()}`;
  const key = `chatkit-attachments/${id}${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  assertAttachmentCanBeStored({
    bytes,
    mimeType,
    maxBytes: config.maxBytes,
    allowedMimeTypes: config.allowedMimeTypes,
  });
  assertStorageConfigured(config.bucketName);

  await s3.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: bytes,
      ContentType: mimeType,
      Metadata: {
        'attachment-id': id,
        'attachment-thread-id': threadId ?? '',
        'original-name': sanitizeFilename(fileName).slice(0, 1000),
      },
      ContentLength: bytes.length,
    }),
  );

  return {
    id: key,
    name: fileName,
    mimeType,
    previewUrl: previewBaseUrl ? `${previewBaseUrl}?id=${encodeURIComponent(key)}` : '',
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
    readable.on('error', (error: unknown) =>
      reject(error instanceof Error ? error : new Error(String(error))),
    );
    readable.on('end', () => resolve());
  });

  return Buffer.concat(chunks);
}

export async function fetchAttachmentForDownload(
  id: string,
  config: AttachmentUploadConfig,
): Promise<DownloadedAttachment> {
  assertAttachmentId(id);
  assertStorageConfigured(config.bucketName);

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: id,
    }),
  );

  return {
    bytes: await streamToBuffer(response.Body),
    contentType: response.ContentType || 'application/octet-stream',
    filename: sanitizeFilename(id.split('/').pop() ?? 'attachment'),
  };
}
