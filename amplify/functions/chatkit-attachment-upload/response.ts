import { sanitizeFilename } from './policy.ts';
import type { LambdaResponse, StoredAttachment } from './types.ts';

export function json(statusCode: number, body: unknown): LambdaResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

export function binary(body: Buffer, contentType: string, filename: string): LambdaResponse {
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

export function uploadSuccess(attachment: StoredAttachment): LambdaResponse {
  return json(200, {
    id: attachment.id,
    name: attachment.name,
    type: 'image',
    mime_type: attachment.mimeType,
    preview_url: attachment.previewUrl,
  });
}
