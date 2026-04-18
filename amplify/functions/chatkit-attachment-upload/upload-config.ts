import { z } from 'zod';
import type { AttachmentUploadConfig } from './types.ts';

const DEFAULT_MAX_ATTACHMENT_BYTES = 8_000_000;
const MAX_CONFIGURABLE_ATTACHMENT_BYTES = 25_000_000;

const DEFAULT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
];

const attachmentUploadEnvSchema = z.object({
  CHATKIT_ATTACHMENT_BUCKET_NAME: z.string().trim().optional(),
  CHATKIT_ATTACHMENT_MAX_BYTES: z
    .union([z.string().trim().min(1), z.undefined()])
    .transform((value) => Number.parseInt(value ?? String(DEFAULT_MAX_ATTACHMENT_BYTES), 10))
    .pipe(z.number().int().positive().max(MAX_CONFIGURABLE_ATTACHMENT_BYTES))
    .optional(),
  CHATKIT_ATTACHMENT_ALLOWED_MIME_TYPES: z.string().optional(),
});

function parseAllowedMimeTypes(value?: string): Set<string> {
  const configured = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return new Set(configured.length > 0 ? configured : DEFAULT_ALLOWED_MIME_TYPES);
}

export function readAttachmentUploadConfig(
  env: NodeJS.ProcessEnv = process.env,
): AttachmentUploadConfig {
  const parsed = attachmentUploadEnvSchema.safeParse(env);
  const source = parsed.success ? parsed.data : env;
  const rawMaxBytes = parsed.success
    ? (parsed.data.CHATKIT_ATTACHMENT_MAX_BYTES ?? DEFAULT_MAX_ATTACHMENT_BYTES)
    : Number.parseInt(env.CHATKIT_ATTACHMENT_MAX_BYTES ?? String(DEFAULT_MAX_ATTACHMENT_BYTES), 10);
  const maxBytes =
    Number.isFinite(rawMaxBytes) && rawMaxBytes > 0 ? rawMaxBytes : DEFAULT_MAX_ATTACHMENT_BYTES;

  return {
    bucketName: source.CHATKIT_ATTACHMENT_BUCKET_NAME,
    maxBytes,
    allowedMimeTypes: parseAllowedMimeTypes(source.CHATKIT_ATTACHMENT_ALLOWED_MIME_TYPES),
  };
}
